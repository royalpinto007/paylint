# What gets checked

Based on the baseline [Solana Pay specification](https://github.com/solana-developers/solana-pay/blob/master/SPEC.md), reviewed 27 October 2026.

| Check                             | Result                                                   |
| --------------------------------- | -------------------------------------------------------- |
| Recipient, token mint, references | Base58 encoding and 32-byte length                       |
| SOL amount                        | Decimal syntax, 9-place precision and u64 lamport bounds |
| Token amount                      | Decimal syntax; mint decimals remain unverified          |
| Optional amount                   | An absent amount means the payer would be prompted       |
| Metadata                          | UTF-8 URL decoding; control characters rejected          |
| Duplicate parameters              | Only `reference` may repeat; ordering preserved          |
| Transaction link                  | HTTPS structure, credentials rejected, query encoding    |
| Unknown fields                    | Visible review finding; not silently interpreted         |

A URL contains no network selection. Identity, ownership, mint existence, token decimals, account type and payment status need separate verification. A base58 address could be an associated token account even though the protocol expects the recipient's owner address; offline inspection cannot determine that.

Transaction endpoints are never fetched, so their future transaction instructions, recipients and amounts remain unknown. HTTPS alone does not make a request trustworthy. Alpha extensions, including redirect behavior, are not implemented.

The browser accepts PNG/JPEG/WebP images up to 8 MiB and 16 megapixels. It decodes one QR code per image with jsQR. Images are never uploaded, stored or used to trigger navigation. Blurry or very dense images may not decode. There is no camera permission or remote image URL support.

Input URLs are capped at 8192 characters. Reports contain the decoded public fields, including any memo or endpoint query. Review exports before sharing.
