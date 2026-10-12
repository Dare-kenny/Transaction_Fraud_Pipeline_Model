# transaction-fraud-pipeline-model

A NestJS service that scores a card transaction for fraud risk through a chain
of responsibility, and answers APPROVED, REVIEWING or REJECTED with the reasons.

Stateless: no database, no ORM, no driver. Nothing needs to be running for the
app or its tests.

```
POST /check    score one transaction
GET  /health   live rule set + in-memory state
```

## Quick start

```bash
npm install
npm run start:dev    # http://localhost:3000
```

```bash
curl -X POST localhost:3000/check -H 'Content-Type: application/json' -d '{
  "cardNumber": "5500 0000 0000 0004",
  "amount": 5000,
  "country": "NG",
  "ip": "102.89.1.1",
  "userId": "u1"
}'
```

| Script | Does |
| - | - |
| `npm run start:dev` | watch mode |
| `npm run build` + `npm run start:prod` | compile to `dist/`, run it |
| `npm test` | all 110 tests (unit + e2e) |
| `npm run test:cov` | coverage |
| `npm run typecheck` | `tsc --noEmit` |

## How it works

Five links run in order, cheapest and most decisive first:

```
cardBlacklist -> amountThreshold -> velocity -> geoIp -> finalDecision
```

Each of the first four only raises weighted signals; none of them decides
anything. A blacklist hit stops further detection, but the chain is still walked
to `finalDecision`, so the outcome is decided in exactly one place.

| Rule | Signal | Weight |
| - | - | - |
| Card on the blacklist (stops detection) | `BLACKLISTED_CARD` | 100 |
| Amount above the threshold | `AMOUNT_OVER_THRESHOLD` | 50 |
| Too many attempts per user in the window | `VELOCITY_LIMIT_EXCEEDED` | 60 |
| Declared country not on the allow-list | `GEO_COUNTRY_NOT_ALLOWED` | 20 |
| Source IP resolves to a different country | `GEO_IP_COUNTRY_MISMATCH` | 35 |
| IP is private, reserved, IPv6 or unmapped | `GEO_IP_UNRESOLVED` | 10 |

`finalDecision` then reads the total score, and nothing else:

| Score | Outcome |
| - | - |
| 100 or more | `REJECTED` |
| 40 to 99 | `REVIEWING` |
| under 40 | `APPROVED` |

So three mild signals can add up to a rejection, while one mild signal does not
force a review:

```jsonc
// amount over threshold (50) + unlisted country (20) + IP mismatch (35)
{
  "status": "REJECTED",
  "score": 105,
  "thresholds": { "review": 40, "reject": 100 },
  "audits": [
    "Amount 99000000 exceeds the threshold of 20000000",
    "Declared country US is not in the allowed set [NG, GB, NZ, NL, AU, FR, DE, CA]",
    "IP 102.89.1.1 resolves to NG but the transaction declares US"
  ],
  "signals": [{ "code": "GEO_IP_COUNTRY_MISMATCH", "message": "...", "weight": 35 }],
  "checksApplied": ["cardBlacklist", "amountThreshold", "velocity", "geoIp", "finalDecision"],
  "checksSkipped": [],
  "card": "550000******0004"
}
```

Cards are always masked, every threshold and weight comes from the environment
(see `.env.example`), a bad setting stops startup rather than failing per
request, and adding a rule is one handler class plus one entry in `CHAIN_ORDER`
in [fraud-chain.provider.ts](src/fraud/chain/fraud-chain.provider.ts).

## Two things to know

- The IP-to-country table in [geo-ip.table.ts](src/config/geo-ip.table.ts) is a
  small stub so the rule works offline. Point `FRAUD_GEO_IP_RANGES` at a real
  dataset, or replace `GeoIpResolver`; the handler above it does not change.
- The velocity window lives in memory, per process. Behind more than one replica
  each instance counts only its own traffic.
