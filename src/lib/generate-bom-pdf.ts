"use client";

/**
 * On-demand PDF BOM generator.
 *
 * Generates a multi-page A4 PDF containing:
 *   - Madacan logo (top-left of page 1)
 *   - Document title + scaffold dimensions + date
 *   - Full BOM table (Part type, Description, Qty, Unit kg, Total kg)
 *   - Totals footer (total weight in kg + tons, total parts)
 *   - Page numbers on every page
 *
 * Runs entirely client-side via jsPDF + jspdf-autotable. No server round-trip.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { AssemblyResult, BomDetailItem } from "@/lib/tower-assembler";

/**
 * jspdf-autotable sets `doc.lastAutoTable` at runtime after each autoTable()
 * call, but the type isn't declared. We extend the jsPDF type with this
 * property so we can read `finalY` for cursor tracking without casts.
 */
interface AutoTableResult {
  finalY?: number;
  pageNumber?: number;
}
interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: AutoTableResult;
}

/**
 * Fetch the Madacan logo from /public and convert it to a base64 data URL
 * suitable for jsPDF.addImage(). Returns null if the fetch fails (we fall
 * back to a text-only header).
 */
async function loadLogoAsDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/madacan-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("FileReader did not return a string"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Format a date as YYYY-MM-DD HH:mm (local time).
 */
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Generate and download the BOM PDF.
 *
 * @param result  The full assembly result (config + BOM + actual dimensions).
 * @throws Re-throws any error from jsPDF so the caller can show a toast.
 */
export async function generateBomPdf(result: AssemblyResult): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ─── HEADER (page 1 only) ────────────────────────────────────────────
  const logoDataUrl = await loadLogoAsDataUrl();
  let cursorY = margin;

  if (logoDataUrl) {
    // Logo: 18mm tall, aspect ratio preserved (93×105 → 18mm × 20.3mm)
    const logoH = 18;
    const logoW = (93 / 105) * logoH;
    doc.addImage(logoDataUrl, "PNG", margin, cursorY, logoW, logoH);
    cursorY += logoH + 4;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("MADACAN", margin, cursorY + 6);
    cursorY += 12;
  }

  // Company name + tagline
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("MADACAN — Scaffold Tower BOM", margin, cursorY);
  cursorY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text("Bill of Materials — Baku, Azerbaijan", margin, cursorY);
  cursorY += 5;

  // ─── DISCLAIMER BANNER: NOT FOR DETAILED DESIGN ───
  doc.setFillColor(255, 243, 205); // amber-100
  doc.setDrawColor(220, 160, 30);   // amber-600
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, cursorY, pageWidth - 2 * margin, 7, 1.2, 1.2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(140, 80, 10);    // amber-800
  doc.text("⚠  NOT FOR DETAILED DESIGN  —  Quick field estimate (±10% tolerance)", margin + 3, cursorY + 5);
  cursorY += 10;

  // Date + generated timestamp (right-aligned)
  const now = new Date();
  const timestamp = formatDateTime(now);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated: ${timestamp}`, pageWidth - margin, cursorY - 5, { align: "right" });

  // ─── SCAFFOLD SUMMARY ────────────────────────────────────────────────
  cursorY += 3;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Scaffold Summary", margin, cursorY);
  cursorY += 6;

  // Summary table: 2 columns of key/value pairs
  const { config, bom, actualDimensions, input } = result;
  const summaryRows: Array<[string, string]> = [
    ["Requested dimensions", `${(input.requestedLength / 1000).toFixed(2)}m × ${(input.requestedWidth / 1000).toFixed(2)}m × ${(input.requestedHeight / 1000).toFixed(2)}m`],
    ["Actual dimensions", `${(actualDimensions.length / 1000).toFixed(2)}m × ${(actualDimensions.width / 1000).toFixed(2)}m × ${(actualDimensions.height / 1000).toFixed(2)}m`],
    ["Bay configuration", `${config.bays_x}×${config.bays_y} bays (${config.bay_length_x}×${config.bay_length_y}mm)`],
    ["Lifts", `${config.num_lifts} × ${config.lift_height}mm`],
    ["Base type", config.base_type === "wheel" ? "Caster wheel (total-lock)" : "Fix base jack 38×600mm"],
    ["Plank width", `${config.plank_width}mm`],
    ["Ladder (primary)", config.include_ladder ? "Yes" : "No"],
    ["Secondary access", config.secondary_access ? "Yes (auto)" : "No"],
    ["Total parts", `${bom.total_parts} pcs`],
    ["Total weight", `${bom.estimated_weight_kg.toLocaleString()} kg (${(bom.estimated_weight_kg / 1000).toFixed(2)} t)`],
    ["Tolerance (±10%)", `${Math.round(bom.estimated_weight_kg * 0.9).toLocaleString()} – ${Math.round(bom.estimated_weight_kg * 1.1).toLocaleString()} kg`],
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [["Field", "Value"]],
    body: summaryRows,
    theme: "striped",
    headStyles: { fillColor: [34, 90, 50], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
  });
  cursorY = ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? cursorY) + 8;

  // ─── DETAILED BOM TABLE ──────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Detailed Bill of Materials", margin, cursorY);
  cursorY += 4;

  // Group items by part_type for readability, then list each as a row.
  const details = result.bom.details as BomDetailItem[];
  const tableBody = details.map((d) => [
    d.part_type,
    d.description,
    String(d.quantity),
    d.unit_weight_kg.toFixed(2),
    d.total_weight_kg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: [["Part type", "Description", "Qty", "Unit kg", "Total kg"]],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [34, 90, 50], textColor: 255, fontSize: 9, halign: "center" },
    bodyStyles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 14, halign: "right", font: "courier" },
      3: { cellWidth: 18, halign: "right", font: "courier" },
      4: { cellWidth: 22, halign: "right", font: "courier", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // Page footer: page number + "Madacan" branding + disclaimer on every page
      const page = doc.getNumberOfPages();
      const current = doc.getCurrentPageInfo().pageNumber;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(
        `Madacan — Scaffold Tower BOM  ·  Page ${current} of ${page}  ·  ⚠ Not for detailed design (±10%)`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" },
      );
    },
  });
  cursorY = ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? cursorY) + 6;

  // ─── TOTALS FOOTER ───────────────────────────────────────────────────
  // If the totals fall close to the bottom of the page, add a new page.
  if (cursorY > pageHeight - 40) {
    doc.addPage();
    cursorY = margin;
  }

  doc.setDrawColor(34, 90, 50);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(34, 90, 50);
  doc.text("TOTAL", margin, cursorY);
  doc.text(
    `${bom.estimated_weight_kg.toLocaleString()} kg  ·  ${(bom.estimated_weight_kg / 1000).toFixed(2)} t  ·  ${bom.total_parts} parts`,
    pageWidth - margin,
    cursorY,
    { align: "right" },
  );
  cursorY += 6;

  // Tolerance range line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Tolerance ±10%: ${Math.round(bom.estimated_weight_kg * 0.9).toLocaleString()} – ${Math.round(bom.estimated_weight_kg * 1.1).toLocaleString()} kg  (${((bom.estimated_weight_kg * 0.9) / 1000).toFixed(2)} – ${((bom.estimated_weight_kg * 1.1) / 1000).toFixed(2)} t)`,
    margin,
    cursorY,
  );
  cursorY += 5;

  // Disclaimer on totals page
  doc.setFillColor(255, 243, 205);
  doc.setDrawColor(220, 160, 30);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, cursorY, pageWidth - 2 * margin, 6, 1.2, 1.2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(140, 80, 10);
  doc.text("⚠  NOT FOR DETAILED DESIGN  —  Quick field estimate ±10%  —  Madacan", margin + 3, cursorY + 4);

  // Reset page-number footer (the didDrawPage callback above handles
  // footers on pages produced by autotable, but if we just added a new page
  // for the totals, we need to draw the footer on this page too).
  const current = doc.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Madacan — Scaffold Tower BOM  ·  Page ${current} of ${total}  ·  ⚠ Not for detailed design (±10%)`,
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" },
  );

  // ─── PDF METADATA ────────────────────────────────────────────────────
  doc.setProperties({
    title: `Madacan BOM — ${actualDimensions.length}×${actualDimensions.width}×${actualDimensions.height}mm`,
    subject: "Scaffold Tower Bill of Materials",
    author: "Madacan",
    creator: "Madacan Scaffold Tower BOM Estimator",
    keywords: "Madacan, scaffold, BOM, bill of materials, Baku",
  });

  // ─── SAVE ────────────────────────────────────────────────────────────
  const dimsLabel = `${actualDimensions.length}x${actualDimensions.width}x${actualDimensions.height}mm`;
  const fileName = `Madacan_BOM_${dimsLabel}_${now.getTime()}.pdf`;
  doc.save(fileName);
}
