/**
 * @module services/scanner
 * Virus/malware scanning abstraction.
 * Development: auto-CLEAN (no actual scanning).
 * Production: integrate ClamAV via clamd socket or REST API.
 */
import { Attachment } from "../models/Attachment";
import { ENV } from "../config/env";

export type ScanResult = "CLEAN" | "INFECTED";

/**
 * Scan a file and update the attachment record.
 * In dev/test mode, immediately marks as CLEAN.
 * In production, this would send to ClamAV and await result.
 */
export async function scanAttachment(attachmentId: string): Promise<ScanResult> {
  const attachment = await Attachment.findById(attachmentId);
  if (!attachment) throw new Error("Attachment not found");

  let result: ScanResult;

  if (ENV.IS_PROD) {
    // Production: integrate ClamAV
    // const clamResult = await clamav.scanBuffer(fileBuffer);
    // result = clamResult.isInfected ? "INFECTED" : "CLEAN";
    result = "CLEAN"; // placeholder until ClamAV integration
  } else {
    // Dev/test: auto-clean
    result = "CLEAN";
  }

  attachment.scanStatus = result;
  attachment.scannedAt = new Date();
  await attachment.save();

  return result;
}
