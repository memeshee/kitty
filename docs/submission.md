# Submission pack (Cycle III)

The form signs in with GitHub, asks for these fields, and opens a pull request to
`nimiq/miniappscompetition-submissions`. Three of the fields are literally the promotion
points, so they are drafted here rather than improvised on deadline day.

Deadline: **2026-11-12T00:00:00Z** (Thu 12 Nov 07:00 +07). Submit **10 Nov**.

## Fields

| Field | Value |
|---|---|
| app name | Kitty |
| category | Save |
| tagline (120) | *drafted below* |
| description (280 chars) | *drafted below* |
| pricing | Free |
| repo_url | https://github.com/memeshee/kitty |
| demo_url | https://kitty-one-orpin.vercel.app |
| video_url | required, YouTube/Loom/Vimeo/X. Record 10 Nov. |
| contact_email | kiter2509@gmail.com |
| team_name | (blank, solo) |
| team_members | (blank) |
| x_account | @0xMemeshe |
| builder_story (4000 chars) | **Final text below, 2,259 chars.** Carries the real first payment (5 NIM, block 65,891,682) |
| video_url | https://youtu.be/IgbqfNUR9sw |
| skool_post_url | 2 points. Post draft below before filling the form. |
| social_post_url | 3 points. Post draft below before filling the form. |
| heard_about | Nimiq Mini Apps Competition site |
| icon | 512x512 from `web/app/icon.svg` |
| thumbnail | 240x240 |
| screenshots | 3-5, required |

## Tagline

> A jar your people fill. Name the goal, share one link, family chips in — every coin a real NIM payment with a receipt.

118 characters.

## Description (under 280 characters)

> Kitty is a goal jar inside Nimiq Pay. Name what you save for, share one link, and the people who care chip in from their phones. Every contribution is a real NIM payment to the owner's own wallet, tagged on-chain, with a receipt anyone can check.

246 characters, measured. The form caps at 280 characters, not words.

**Category is `Save` and pricing is `Free`.** Cycle III's category vocabulary is exactly
`Pay / Save / Earn / On/Off-Ramp / Off-theme`, and pricing is `Free / Freemium / Paid` — both
mirrored from the competition's own validator (`scripts/lib/schema.mjs` in
`nimiq/miniappscompetition-submissions`), not guessed from the general category list on the rules
page.

## Skool post (2 points)

Post in the community, then paste the URL into the form.

> **Kitty is entering Cycle III in Save: a jar your people fill**
>
> The thing that frustrated me about collecting money is not the paying, it is the keeping track. A group chat cannot tell you who chipped in, and a platform that holds the pot asks you to trust it with everyone's money.
>
> Kitty does it with a link and a public receipt. You name the goal, set the target and the date, and share it on WhatsApp. Anyone with Nimiq Pay chips in any amount, in one tap. The NIM goes straight to the goal owner's own wallet, tagged with the goal id on-chain, and every single coin shows up on the goal page with a hash you can open in the explorer. There is no custodian, no escrow and no key anywhere near us: the whole product is public bookkeeping over real payments.
>
> Two things I would love from this community:
> 1. Try it with a real thing you have to collect for. School fees, a wedding, a shared gift. Tell me where it breaks.
> 2. Tell me what you would want to see on the goal page that is not there.
>
> [link]
>
> Everything is MIT and the repo is public: [repo]

## X post (3 points)

Account: @0xMemeshe. One post is enough for the checklist; a short thread is better.

> Collecting money for something is a group chat problem, not a payments problem.
>
> Kitty is a goal jar inside Nimiq Pay: name what you are saving for, share one link, and everyone chips in from their own phone.
>
> Every coin is a real NIM payment to the owner's own wallet, tagged on-chain, with a receipt anyone can open. Kitty never holds the money.
>
> Save category, Nimiq Mini Apps Competition Cycle III.
>
> [link]

## Uploaded assets

In `submission/`, all captured from the live deployment at 760x1647:

1. `screen-goal.png` — the jar at 5 of 50 NIM with one verified receipt. **First upload: this is the
   social preview.**
2. `screen-chipin.png` — the chip-in sheet, 5 NIM selected, name and note filled.
3. `screen-receipt.png` — `/r/8afa45e0...901ab9`, the receipt as its own forwardable page.
4. `screen-proof.png` — the public proof page: jars, receipts, people, NIM moved.
5. `screen-home.png` — the jar list.

`icon-512.png` (full-bleed square, no rounded corners — the platform masks it), `thumbnail-240.png`
(inverted cream variant), and `contact-sheet.png` for a single-glance preview. Total 2.5 MB, well
inside the 2 MB/file and 14 MB/total caps.

The native Nimiq Pay approval sheet showing `kitty:aakgnbsc` is in the demo video at 00:16 instead of
a still: a screenshot of it cannot prove the memo was in the wallet's own dialog.

## Builder story (final, 2,260 characters)

Paste this into the builder-story field as plain text.

Someone in every family keeps the list. Who has paid, who still owes, and whether the money is really there. That person chases cousins, fronts the gap, and hopes the count is right.

I did not want to build another payment app. The paying was never the hard part. The hard part is the keeping track, and the trust: a group chat cannot tell you who chipped in, and a platform that holds the pot asks you to trust it with everyone's money.

Then I read the Nimiq Pay Mini Apps Framework inventory properly, and the constraint turned out to be the product. The platform gives a Mini App a 64-byte public memo on every payment, a balance read without approval, and a native approval sheet. It gives you no way to create a contract, no HTLC, no cashlink, and the wallet always picks the signing account. So there is no way to build a shared pot that holds money. The only honest shape left is: the money goes straight to the person it is for, and the app does the bookkeeping in public.

That is Kitty. You name the goal, set a target and a date, and share one link. Anyone chips in any amount from their own phone, in Nimiq Pay or from any browser through the Nimiq Hub, and the payment carries kitty:<jar id> as its on-chain memo. Kitty then re-reads that transaction from mainnet before it writes a single row: does the hash exist, did the value reach the jar owner, does the memo carry this jar's tag, did the transaction execute, is the amount the chain's, and has this hash been counted before. Six checks, and a payment that fails any of them never becomes a receipt.

The first real payment was 5 NIM at block 65,891,682 (8afa45e0...901ab9), and the best moment of the build was watching the jar move on its own: the page had printed nothing, then it re-read the chain and printed what it found. Every receipt has its own page you can forward back into the chat, and every one opens on a Nimiq explorer.

What I would build next: recurring chips (the same aunt every month), a goal page that reads in the family's own language, and an owner-side nudge that is a real payment request rather than a message. What I will not build is a custodian.

MIT, no token, no AI, no contract. The whole product is public bookkeeping over payments that already happened.

## Video — shipped, 2:07

**https://youtu.be/IgbqfNUR9sw** — public, plays logged out.

Hook, then a live jar creation, then the real footage: the link, the chip-in, the wallet's own
approval sheet carrying `kitty:aakgnbsc`, the receipt landing, its own forwardable page, and the
public proof page. Every number on screen is read from mainnet, not from the app's copy.

One screen in it is now stale and worth knowing about: the receipt screen was recorded on 2 November
and reads `RECEIPTS 0 IN` above a `+5` row. That was the state at the time; the current build renders
`5 NIM` and "the receipts above add up to 5 NIM" correctly. If the video is ever re-cut, that is the
only frame that needs re-recording.

## Before submitting, re-check inside 24 hours

- Every URL returns 200, including the deployed app and the repo.
- The description is under 280 characters.
- The video is public and plays logged out.
- Both promotion posts are live and their URLs are pasted in.
- The app is on mainnet, not testnet.
- No secrets in the repo (`git log -p | grep -iE 'token|secret'`).
- The README verification table matches what is actually live.
