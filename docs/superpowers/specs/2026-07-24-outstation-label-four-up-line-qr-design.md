# Outstation Label Four-Up and Line QR Design

## Goal

Print four outstation labels per A4 page, preserve readable sender and recipient information, keep the dispatch QR clear of sender text, and add a small Line@ QR linking to Hillkoff.

## Selected layout

- Split each A4 print page into four equal rows.
- Keep the dispatch QR absolutely positioned in the lower-left free area of each label. It remains independent of the sender and recipient document flow.
- Place a separate, smaller Line@ QR in the center free area with the caption `Add line Hillkoff`.
- Generate the Line@ QR from `https://page.line.me/769svedb?oat_content=url&openQrModal=true`.
- Give both QR blocks distinct CSS classes and fixed bounds so neither can move sender or recipient text.
- Preserve the recipient block on the right and the footer note/box count at the bottom.

## Alternatives considered

1. Put both QR codes together at lower left. Simple, but creates a dense block and leaves less scan clearance.
2. Put the Line@ QR beside the carrier at upper right. Rejected because tracking and COD can occupy that area.
3. Selected: dispatch QR at lower left and Line@ QR in the center free area. This separates purposes and uses the additional height from the four-row layout.

## Verification

- Pagination tests must show four labels on page one and remaining labels on page two.
- Render tests must include both the dispatch QR payload and the Line@ URL/caption.
- QR generation tests must produce PNG data URLs for both payload types.
- Lint, unit tests, and production build must pass.
