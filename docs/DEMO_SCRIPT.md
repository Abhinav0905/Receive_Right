# ReceiveRight demo video script

| | |
| --- | --- |
| Target length | 2:30 to 2:45 (hard limit: under 3:00) |
| Language | English |
| Track shown | Alexa+ through the simulated-experience path; AWS Builder (Amazon Bedrock) |
| Status | Not recorded yet. TODO (owner): record, upload, add the video URL to the submission. |
| Microphone | Physical microphone dictation has **not** been tested by the developer. The full flow was rehearsed only with a simulated speech recognizer. TODO (owner): test the real microphone in the browser you record with (see the checklist). |

The video leads with the receiving problem and the working conversation, then shows review, confirmation, a second delivery, the receipt history, the supplier draft and, last, the integration page with the MCP check.

## What the video has to show

From the official rules and FAQ (the owner should re-check them before submitting):

- Under 3 minutes, in English, publicly visible on YouTube or Vimeo.
- The project working as shown. For the simulated Alexa+ path, the video must clearly show the simulated experience.
- Name the track's tool clearly, not in passing: say "Amazon Bedrock" and show it working.
- No third-party trademarks or copyrighted music without permission. No Alexa+ logo. Plain-text "simulated Alexa+ experience" wording without a logo and without an Alexa-like voice was described by the organizers as fine.

## Honest wording

Say only what the app shows on screen.

| Say | Do not say |
| --- | --- |
| "a simulated Alexa+ experience", "an independent web page", "not an Alexa device" | "works with Alexa", "Alexa skill", "runs on Echo", "connected to Alexa" |
| "Amazon Bedrock does the reasoning" | "Alexa understands", "Alexa does the reasoning" |
| "MCP is shown separately; the Bedrock assistant does not go through MCP" | "Alexa talks to our MCP server" |
| "a prototype", "runs locally" | "deployed", "live in production", "used by cafés", "customers" |
| The numbers on screen (10, 1, 9, 2, 12, 11, 0) | Response times, savings, accuracy rates, adoption |
| "Only a person can confirm" | "the AI saves the receipt", "fully automatic" |

The app is an independent prototype, not an Amazon product.

## Recording sequence

1. Select the fresh **DEMO-OAT-NN** order created with **New demo run**.
2. Click the assistant microphone and say the full instruction: *"Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review."* Stop, check the text, click **Send**.
3. Show the draft. Explain 9 accepted, 1 damaged, 2 outstanding.
4. Open **Review receipt** and explicitly click **Confirm & save receipt**.
5. Record a second delivery of two good cases as a separate delivery. Review, confirm.
6. Open **Receipt history** focused on that order: two receipts, 0 undelivered, 1 damaged kept as history.
7. Open the supplier discrepancy draft. Do not send, copy or download it.
8. Go to **Demo & integration**. Run the MCP check and show the short real trace (negotiated 2025-11-25, tools, HTTP 200/202, identical data) and the Bedrock status line.

## Timed script

Timestamps are a plan for about 2:40. Each row's voice-over fits its time slot at about 150 words per minute, with numbers such as "2025-11-25" counted as spoken. Bedrock replies take a few seconds and vary, so the finished take should land between 2:30 and 2:45. Do not talk while the microphone is listening; the browser would transcribe the narration.

| Time | Screen | Action | Voice-over |
| --- | --- | --- | --- |
| 0:00–0:14 | **Receiving** page. Fresh DEMO-OAT-NN card with the DEMO label, 12 cases of oat milk. | Click the DEMO-OAT-NN card in **Purchase orders** (it is already selected after New demo run). | "Cafés and small shops check each delivery against a purchase order. Counts get messy: short deliveries, damaged cases, the rest arriving later. ReceiveRight turns what staff say into a receipt a person confirms." |
| 0:14–0:23 | Assistant panel header: "Talk through this delivery · DEMO-OAT-NN · Alexa+ experience simulator · Amazon Bedrock". | Rest the cursor on the header. Optional caption: "Simulated Alexa+ experience · independent web prototype · not an Alexa device". | "This is a simulated Alexa+ experience in an independent web page, not an Alexa device. Amazon Bedrock does the reasoning." |
| 0:23–0:40 | Assistant composer. While listening the text box is read-only and **Send** is disabled. | Click the microphone. Say the full instruction at a normal pace. Click stop. Pause one second on the text. Click **Send**. | *(Your live dictation is the audio.)* After stopping: "I check the text first. Dictation only fills the box; it never sends." |
| 0:40–0:52 | "Checking the order and preparing a reply…", then the reply. | Expand **Actions taken in this turn** (for example Open draft, Update counts, Prepare review; the exact list can vary). | "Amazon Bedrock, through the Converse API with tool use, reads this order and may only use a few validated receiving tools. None of them can confirm a receipt." |
| 0:52–1:02 | **Delivery counts** table and the line under it: 9 cases accepted · 1 damaged · 2 undelivered. | Point at Received 10, Of those, damaged 1, Accepted 9, then 2 undelivered. | "Ten received includes the damaged case. So nine accepted, one damaged, and two cases still outstanding." |
| 1:02–1:16 | **Review this delivery** dialog: 10 received, 1 damaged, 9 accepted, "2 cases still undelivered". Then the **Receipt confirmed** dialog and the green notice. | Click **Review receipt**. Pause on the numbers. Click **Confirm & save receipt**. | "Only a person can save a receipt. I review the numbers and click Confirm and save receipt. A saved receipt can't be edited afterwards." |
| 1:16–1:41 | Same order, same conversation. Second review dialog: 2 received, 0 damaged, 2 accepted, "0 cases still undelivered". | Close the receipt dialog. Click the microphone and say *"A second delivery just came: two more cases, both in good condition."* Stop, check, **Send**. Click **Review receipt**, then **Confirm & save receipt**. | During the reply wait: "Later, the last two cases arrive. That's a separate delivery with its own review and its own confirmation. The first delivery isn't counted again." |
| 1:41–1:53 | **Receipt history** focused on DEMO-OAT-NN: "Confirmed receipts 2"; 12 ordered · 12 received across 2 receipts · 11 accepted · 1 damaged (kept on record) · 0 undelivered. | Close the dialog. Click **View receipts** in the "2 previous receipt(s) included in totals" strip. | "This order's history: two receipts, twelve received, eleven accepted, zero undelivered. The damaged case stays on record. Fully delivered isn't the same as fully accepted." |
| 1:53–2:02 | **Supplier report draft** dialog with "Draft only. No message has been sent." | Click **Draft supplier report** in the focus line. Scroll a little. Close with the X. Do not click Copy draft or Download. | "It drafts a discrepancy note for the supplier. It's a draft only; nothing is sent." |
| 2:02–2:32 | **Demo & integration**. Integration status: "Amazon Bedrock conversation · Bedrock responded", Model / region, "Alexa+ device / SDK · Not connected (simulator)". Then the MCP panel: status line, Negotiated protocol 2025-11-25, Tools discovered 11, "Identical data", request trace. | Click **Demo & integration** in the sidebar. Pause on the status card. Scroll to the MCP panel. Click **Run MCP check (read-only)**. Pause on the result and trace. | "This page says what's real: Bedrock answered these turns, and no Alexa device or SDK is connected. This panel is a real MCP client calling our own server over Streamable HTTP: initialize, tools list, then a tools call. It negotiated 2025-11-25, found eleven tools and read identical data. The Bedrock assistant doesn't use MCP; both share the same receiving operations." |
| 2:32–2:40 | Hold on the integration page, or an end card with the project name and repository URL. | None. | "ReceiveRight is an independent prototype, not an Amazon product. The source and setup steps are in the repository." |

If a take runs past 2:45, shorten in this order: skip expanding **Actions taken in this turn** (row 4), shorten row 2 to its first sentence, then shorten the closing line. Do not cut the Confirm click, the second review or the MCP result.

If the screen shows a different number than the voice-over (for example a different tool count), say what is on screen and update this script.

## Shot list

| Shot | Must be readable on screen | Notes |
| --- | --- | --- |
| S1 Order | DEMO-OAT-NN, DEMO label, 12 cases oat milk | Earlier DEMO orders can stay in the list; the app never clears existing records. |
| S2 Simulator label | "Alexa+ experience simulator · Amazon Bedrock" in the assistant header | Plain text only. Never add an Alexa logo in editing. |
| S3 Dictation | Listening state, then the full transcribed sentence in the text box before **Send** | Keep the live audio of the spoken instruction in the final cut. |
| S4 Reply | Assistant reply and the actions list | Reply wording varies between takes. Narrate only the numbers the app shows. |
| S5 Draft | Received 10, damaged 1, accepted 9; "2 undelivered" | Zoom in during editing if the table is small. |
| S6 Confirm | Review dialog numbers; cursor visibly clicking **Confirm & save receipt**; success notice | The explicit human click is the point of this shot. |
| S7 Second delivery | Second review dialog 2 / 0 / 2 and "0 cases still undelivered"; second Confirm click | Same order, separate receipt. |
| S8 History | "Confirmed receipts 2" and the focus line with 11 accepted, 1 damaged (kept on record), 0 undelivered | Use **View receipts** so the history is filtered to this order. |
| S9 Supplier draft | "Draft only. No message has been sent." | Close without sending, copying or downloading. |
| S10 Status | "Bedrock responded" status, model / region, "Alexa+ device / SDK: Not connected (simulator)" | The model ID and region are not secrets. The key never appears in the UI. |
| S11 MCP | Status line with protocol 2025-11-25 and tool count; "Identical data"; trace rows initialize 200, notifications/initialized 202, tools/list 200, tools/call 200, plus the website API comparison read | Trace durations are local measurements. Do not narrate them. |

## Pre-recording checklist

- [ ] **Fresh Bedrock key.** Short-term Bedrock API keys expire (up to 12 hours). Generate a new key in the same session as the recording, put it in `.env` as `AWS_BEARER_TOKEN_BEDROCK`, stop and restart `pnpm dev`. Never show `.env`, the key or the AWS console on screen.
- [ ] **Test connection.** In the assistant panel click **Test connection** (or **Test Bedrock connection** on Demo & integration). Expect the green "Bedrock responded" label. "Last request failed" with an expired-key message means the key needs replacing.
- [ ] **`pnpm dev` running.** Open http://localhost:5173 and keep using the same hostname (localhost and 127.0.0.1 have different cookies). Sign in with the local development identity before you start recording; do not record the sign-in screen, which shows a third-party product name.
- [ ] **Optional MCP pre-check.** `pnpm mcp:smoke` against the running dev server should pass.
- [ ] **Fresh demo run.** Click **New demo run** just before recording. Note the reference in the green notice (DEMO-OAT-NN). It must have no draft and no receipts. For each new take, click **New demo run** again instead of reusing an order.
- [ ] **Microphone permission granted and tested.** In Chrome, allow the microphone for localhost:5173. Check the input device in the system sound settings. Do one test dictation of the full instruction on a different fresh demo order, not the recording order. Confirm that the whole sentence appears, including "Prepare the receipt for review." Browser dictation uses the browser's speech service, which in Chrome usually needs a network connection.
- [ ] **Recorder and dictation share the microphone.** Make a 10-second test recording while dictating and check that both the recording and the text box got your voice.
- [ ] **Close other tabs and notifications.** Turn on Do Not Disturb or Focus. Quit chat and mail apps. Use a clean browser profile without bookmarks or extension icons, or hide them.
- [ ] **Zoom level.** Record at 1920×1080. Set browser zoom to 110–125% so the counts, review dialog and MCP trace are readable. Check that the review dialog fits without scrolling.
- [ ] **No personal data on screen.** The local identity is fictional. Check the order list for anything real; if it has real data, do not record that list. No real names, emails, addresses or account avatars.
- [ ] **No `.env` visible.** Record only the browser window, not the full desktop. Close editor tabs and terminals that show `.env` or server logs.
- [ ] **Read reply aloud stays off.** Do not use the browser's text-to-speech in the video.

## Fallbacks

**Dictation cuts off.** If the text stops early (for example after "including one damaged"), the app keeps the text and shows "Dictation stopped. Your text is kept. Tap the microphone to continue, or edit and send." Tap the microphone and say the rest, or type the rest. Say it honestly in the voice-over: *"Dictation stopped early, so I'm finishing the sentence by typing."* Do not hide the cut in editing, and do not overdub the missing words as if they had been dictated.

**Words misrecognized.** Correct them by typing before **Send** and say so briefly. Checking the text before sending is the designed behavior.

**Microphone unavailable.** Type the same instruction and say: *"I'm typing the same instruction; dictation only fills this text box."* Prefer a retake once the microphone works, because the simulated experience is voice-first.

**Bedrock error** (for example "Last request failed", an expired-key message or a timeout). Stop the take. Replace the key, restart `pnpm dev`, click **Test connection**, create a new demo run and record again. Do not swap in the guided input and present it as AI. The guided input is labelled "GUIDED INPUT · NO AI" and uses a fixed phrase parser.

**MCP check fails.** Locally, the panel uses the same website session. Refresh, check that you are on localhost:5173 and signed in, run `pnpm mcp:smoke`, then retake the integration segment. Do not record the panel against the hosted site; there `/mcp` is behind the hosting gateway and may return 401.

**Take runs long.** Trim idle waiting with a visible hard cut, or shorten the voice-over as described under the timed script. Do not speed up the footage to suggest faster responses.

## Rehearsal steps

1. **Full dry run.** On a fresh demo run, go through the whole sequence with a timer. Write down where you exceed the plan.
2. **Ambiguous instruction, separately.** On another fresh demo run, say or type *"Ten arrived and one was damaged."* In live tests the assistant asked whether the damaged case was one of the ten and recorded nothing until answered. Answer *"Ten total, including the damaged one."* and check that the draft shows 10 received, 1 damaged.
3. **Correction before confirmation, separately.** After a draft exists, say *"Correction: only nine arrived, and one of those nine was damaged."* The draft should become 9 received, 1 damaged (not 19 and 2). A review opened before the correction is out of date and cannot be confirmed; open **Review receipt** again.
4. **Keep steps 2 and 3 out of the final story.** Show at most one of them, very briefly (about 10 seconds), and only if it behaved correctly in your rehearsal. Model replies vary between runs. If you include one, take the time from the optional parts of rows 2 and 4, and check that the finished take still ends by 2:45 (hard limit: under 3:00).
5. **Practise the dictation phrase.** Speak at a normal pace with a short natural pause between the two sentences. Stop only after the last word.
6. **Read the voice-over aloud with a timer.** Adjust wording to your own speech while keeping every claim in the table above.

## Media notes

- No music, or only music you have the rights to use. No copyrighted music.
- No Alexa logo, no Amazon logos added in editing, no Alexa-like synthetic voice. Use your own natural voice for the narration.
- Avoid other third-party marks on screen (sign-in screen, extension icons, other tabs).
- English narration. English captions are optional but help judges.
- Export at 1080p. Check that the final file is under 3:00 before uploading.
- Upload to YouTube or Vimeo and set visibility to **Public**.
- Suggested description line: "Independent hackathon prototype. Simulated Alexa+ experience in a web page; not an Alexa device and not affiliated with Amazon. Conversation powered by Amazon Bedrock (Converse API with tool use). MCP server shown separately."
- TODO (owner): video URL.
- TODO (owner): GitHub repository URL for the end card and video description.
- TODO (owner): final project name on Devpost, if different from ReceiveRight.
