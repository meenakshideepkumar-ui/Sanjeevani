// Integration & Safety — incident log + CSV/PDF export.
// An incident is recorded when a worker becomes a casualty (triage -> red) or
// when the link is lost/recovered. These feed the dashboard's report exports.

const PDFDocument = require('pdfkit');

class Reports {
  constructor() {
    this.incidents = []; // { id, at, ts, worker_id, domain, type, tier, reasons }
  }

  record(inc) {
    const row = {
      id: this.incidents.length + 1,
      at: Date.now(),               // server receive time (ms)
      ts: inc.ts ?? null,           // device timestamp (s)
      worker_id: inc.worker_id ?? '',
      domain: inc.domain ?? '',
      type: inc.type,               // 'casualty' | 'signal_lost' | 'recovered'
      tier: inc.tier ?? '',
      reasons: Array.isArray(inc.reasons) ? inc.reasons.join('; ') : (inc.reasons || ''),
    };
    this.incidents.push(row);
    return row;
  }

  all() { return this.incidents; }

  toCSV() {
    const cols = ['id', 'at_iso', 'worker_id', 'domain', 'type', 'tier', 'reasons'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const i of this.incidents) {
      lines.push([
        i.id, new Date(i.at).toISOString(), i.worker_id, i.domain, i.type, i.tier, i.reasons,
      ].map(esc).join(','));
    }
    return lines.join('\n') + '\n';
  }

  /** Stream a PDF incident report to an Express response (or any writable). */
  toPDF(writable) {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    doc.pipe(writable);

    doc.fontSize(20).fillColor('#1B2A4A').text('Sanjeevani — Incident Report', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#666')
      .text(`Generated ${new Date().toISOString()}  ·  ${this.incidents.length} incident(s)`);
    doc.moveDown(1);

    if (this.incidents.length === 0) {
      doc.fontSize(12).fillColor('#333').text('No incidents recorded this session.');
    }
    for (const i of this.incidents) {
      const color = i.type === 'casualty' ? '#9E2B25' : i.type === 'signal_lost' ? '#B8860B' : '#2E7D4F';
      doc.fontSize(12).fillColor(color)
        .text(`#${i.id}  ${i.type.toUpperCase()}  —  ${i.worker_id} (${i.domain})`);
      doc.fontSize(9).fillColor('#333')
        .text(`time: ${new Date(i.at).toISOString()}${i.tier ? `   tier: ${i.tier}` : ''}`);
      if (i.reasons) doc.fontSize(9).fillColor('#555').text(`reasons: ${i.reasons}`);
      doc.moveDown(0.6);
    }
    doc.end();
  }
}

module.exports = { Reports };
