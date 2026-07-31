# Sanjeevani — Shared Data Protocol (v0 — DRAFT for Day 1 discussion)

> Owned jointly by Krishna, Namitha, Meenakshi. Only editable via reviewed PR.
> Goal: keep the packet byte-sized (LoRa/satellite-ready), so field names
> and types below are picked to stay small — see "Byte budget" at the end.

## 1. Packet fields

| Field | Type | Example | Notes |
|---|---|---|---|
| `id` | string (short) | `"S07"` | Soldier ID. Keep short — e.g. unit+number, not a full UUID. |
| `hr` | int | `132` | Heart rate, bpm. |
| `spo2` | int | `91` | Blood oxygen saturation, %. |
| `lat` | float | `8.5241` | GPS/NavIC latitude. |
| `lon` | float | `76.9366` | GPS/NavIC longitude. |
| `impact_g` | float | `6.2` | Peak impact force from motion sensor, in g. |
| `ts` | int | `1753500000` | Unix timestamp (seconds), when the reading was taken. |

**Discuss tomorrow:**
- Precision for `lat`/`lon` — how many decimal places do we actually need? (Fewer = smaller packet, and ~5 decimals is already ~1m accuracy.)
- Do we send skin temperature too, or is that phase 2? Concept note mentions it for the heat/strain monitoring mode, not the core casualty-detection path.
- Motion/stillness — do we send a raw motion value, or just the derived `impact_g` spike? Simpler for triage logic if we settle this now.

## 2. Example packet (JSON, for simulator + WebSocket testing)

```json
{
  "id": "S07",
  "hr": 132,
  "spo2": 91,
  "lat": 8.5241,
  "lon": 76.9366,
  "impact_g": 6.2,
  "ts": 1753500000
}
```

## 3. What's computed, not transmitted

Per the concept note, triage tier (Green/Yellow/Red) and injury-pattern hint
are *derived* from this raw packet by the triage rules engine (krishna/) —
they are not fields the wearable sends. Server/UI compute and attach them
after receiving the raw packet. Worth confirming this split tomorrow so
Namitha's UI and Meenakshi's server layer know what to expect on the wire
vs. what shows up after processing.

## 4. Byte budget (why field names are short)

Concept note targets a packet in the tens-of-bytes range (LoRa/satellite-ready).
Short JSON keys keep this realistic for the demo, and translate directly to a
compact binary/CBOR encoding later if the transport layer needs it. Avoid
verbose keys like `soldier_id`, `heart_rate`, `blood_oxygen` — the short forms
above (`id`, `hr`, `spo2`) aren't just laziness, they're deliberate.

## 5. Sign-off

- [ ] Krishna
- [ ] Namitha
- [ ] Meenakshi

*Target: lock as v1 on Day 2, all three sign off before anyone builds against it.*
