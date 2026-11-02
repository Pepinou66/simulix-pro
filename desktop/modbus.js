'use strict';
// Client Modbus TCP minimal (fonctions 01, 02, 15) — sans dépendance externe
const net = require('net');

class ModbusTCP {
  constructor() { this.sock = null; this.tid = 1; this.pending = new Map(); this.buf = Buffer.alloc(0); this.unit = 1; }
  connect(host, port = 502, unit = 1, timeout = 3000) {
    this.close(); this.unit = unit;
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host, port });
      const t = setTimeout(() => { s.destroy(); reject(new Error('Délai de connexion dépassé')); }, timeout);
      s.once('connect', () => { clearTimeout(t); this.sock = s; resolve(true); });
      s.once('error', e => { clearTimeout(t); reject(e); });
      s.on('data', d => this.onData(d));
      s.on('close', () => { this.sock = null; for (const [, p] of this.pending) p.reject(new Error('Connexion fermée')); this.pending.clear(); });
    });
  }
  close() { if (this.sock) { this.sock.destroy(); this.sock = null; } }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 7) {
      const len = this.buf.readUInt16BE(4); if (this.buf.length < 6 + len) break;
      const frame = this.buf.subarray(0, 6 + len); this.buf = this.buf.subarray(6 + len);
      const tid = frame.readUInt16BE(0), p = this.pending.get(tid); if (!p) continue;
      this.pending.delete(tid); clearTimeout(p.t);
      const fc = frame[7];
      if (fc & 0x80) p.reject(new Error('Exception Modbus ' + frame[8])); else p.resolve(frame.subarray(7));
    }
  }
  request(pdu, timeout = 1500) {
    if (!this.sock) return Promise.reject(new Error('Non connecté'));
    const tid = this.tid = (this.tid + 1) & 0xffff;
    const h = Buffer.alloc(7); h.writeUInt16BE(tid, 0); h.writeUInt16BE(0, 2); h.writeUInt16BE(pdu.length + 1, 4); h[6] = this.unit;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(tid); reject(new Error('Pas de réponse')); }, timeout);
      this.pending.set(tid, { resolve, reject, t });
      this.sock.write(Buffer.concat([h, pdu]));
    });
  }
  async readBits(fc, addr, n) {
    const pdu = Buffer.alloc(5); pdu[0] = fc; pdu.writeUInt16BE(addr, 1); pdu.writeUInt16BE(n, 3);
    const r = await this.request(pdu); const out = [];
    for (let i = 0; i < n; i++) out.push(!!(r[2 + (i >> 3)] >> (i & 7) & 1));
    return out;
  }
  readCoils(addr, n) { return this.readBits(1, addr, n); }
  readDI(addr, n) { return this.readBits(2, addr, n); }
  async writeCoils(addr, bits) {
    const nb = Math.ceil(bits.length / 8), pdu = Buffer.alloc(6 + nb);
    pdu[0] = 15; pdu.writeUInt16BE(addr, 1); pdu.writeUInt16BE(bits.length, 3); pdu[5] = nb;
    bits.forEach((b, i) => { if (b) pdu[6 + (i >> 3)] |= 1 << (i & 7); });
    await this.request(pdu); return true;
  }
}
module.exports = { ModbusTCP };
