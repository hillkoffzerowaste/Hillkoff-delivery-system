# Outstation Label Four-Up and Line QR Design

## Goal

Print four outstation labels per A4 page, preserve readable sender and recipient information, keep the dispatch QR clear of sender text, and place the small `Add line Hillkoff` caption beside the main dispatch QR.

## Selected layout

- Split each A4 print page into four equal rows.
- Keep the dispatch QR absolutely positioned in the lower-left free area of each label. It remains independent of the sender and recipient document flow.
- Place the caption `Add line Hillkoff` beside the main dispatch QR in the lower-left free area.
- Do not generate a separate Line@ QR on the label.
- Keep the dispatch QR block fixed so it cannot move sender or recipient text.
- Preserve the recipient block on the right and the footer note/box count at the bottom.

## Alternatives considered

1. Put a separate Line@ QR in the center. Rejected because the label only needs one scannable order QR.
2. Put the caption beside the carrier at upper right. Rejected because tracking and COD can occupy that area.
3. Selected: dispatch QR and caption together at lower left. This preserves one order QR and uses the additional height from the four-row layout.

## Verification

- Pagination tests must show four labels on page one and remaining labels on page two.
- Render tests must include the dispatch QR payload and caption, with one QR wrapper only.
- QR generation tests must produce a PNG data URL for the dispatch payload.
- Lint, unit tests, and production build must pass.
