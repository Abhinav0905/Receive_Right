# ReceiveRight submission checklist

**Status: not yet submitted.** This checklist was prepared in the local repository on 2026-10-17/18. Nothing has been pushed to GitHub, uploaded or entered on Devpost.

Entry plan: primary track **Alexa+** through the simulated-experience path. Mini challenge: **AWS Builder**, using Amazon Bedrock.

## Sources

The requirements below come from these pages of the Devpost site "Build, Ship, Shape: Amazon Developer Hackathon" (amazonappdev2026.devpost.com). They were fetched on **2026-10-17 (PDT) / 2026-10-18 (UTC)**:

- **Overview**: Requirements and What to Submit.
- **Rules**: the Official Rules, which carry the "September 16, 2026 UPDATE: Hackathon submission requirements: Code repository".
- **FAQs** tab.
- **Updates**: "Strong Submission Tips" and "FAQs".
- **Discussions**: the threads cited by name below.

**TODO (owner):** re-read the Rules and FAQs on the day you submit. Organizers have changed requirements during the event, and the official pages override this file.

### Status key

| Status | Meaning |
| --- | --- |
| Done in repo | The file or setting exists in this local folder. It has not been pushed or published. |
| TODO (owner) | Only the owner can supply or confirm this. |
| Decision needed | The owner must choose between options before submitting. |

## At a glance

| # | Requirement | Required? | Status |
| --- | --- | --- | --- |
| 1 | Submit by the deadline | Required | TODO (owner) |
| 2 | Choose a primary track and mini challenge(s) | Required | TODO (owner) |
| 3 | Text description | Required | Draft in repo; TODO (owner) to review and paste |
| 4 | Public English video under 3 minutes on YouTube or Vimeo | Required | TODO (owner) |
| 5 | GitHub repository with source, assets, instructions and a license (or a private repo shared with reviewers) | Required | Partly done in repo; TODO (owner) to create the GitHub repo |
| 6 | Product Feedback, including the AWS services used | Required | Draft in repo; TODO (owner) to review and paste |
| 7 | Friction log and feature requests | Optional | Friction log in repo; feature requests need a decision |
| 8 | Explain whether the project is new or existing | Required if it existed before Aug 31 | TODO (owner) to confirm |
| 9 | Judge run instructions and testing access | Required | README done in repo; hosting is a decision |
| 10 | Ownership and eligibility | Required | TODO (owner) |
| 11 | Materials in English | Required | Repo docs done; video TODO |
| 12 | Technical checks before recording | Our process | TODO (owner) on recording day |

## 1. Deadline

- [ ] **Submit by Friday, October 23, 2026, 12:00 pm PT (PDT).** — TODO (owner)
  - The Submission Period started Monday, August 31, 2026, at 10:15 am PT (Rules, section 1).
  - Drafts can be saved before the deadline. After the deadline the Submission cannot be changed (Rules, section 5).
  - Judging runs Nov 9–20, 2026. Winners are announced on or around Dec 3, 2026.
  - Leave time before the deadline in case the video upload or the GitHub invitations need a second attempt.

## 2. Track and mini challenge

- [ ] **Primary track: Alexa+, simulated Alexa+ experience.** — TODO (owner) to select on the form
  - The Rules say the simulated path may use "any AI or agentic tool" and is exempt from the runtime-technology requirement. The repository must still contain the simulation source, and the video must clearly show the simulated experience.
  - The app also has its own MCP endpoint (`POST /mcp`, stateless Streamable HTTP, protocol 2025-11-25). An in-app MCP client on the "Demo & integration" page calls it. The FAQ accepts "a web page that acts as an actual MCP client" (initialize, tools/list, tools/call over Streamable HTTP).
  - Call it a simulation. No Alexa device, Alexa Skills Kit or Alexa+ developer tool was used or connected. Per the FAQ, the gated Alexa+ tools are not available to participants.
- [ ] **Mini challenge: AWS Builder.** — TODO (owner) to select on the form
  - Required field: describe the AWS services used and how, inside the Product Feedback answer (see section 6).
- [ ] **Open Source mini challenge.** — Decision needed (current plan: not entered)
  - It requires a *separate* new open-source project or contribution, with a contribution URL, repository URL, GitHub username and description. Nothing in this repository meets that requirement yet.

## 3. Text description

- [ ] **Description of features and functionality.** — Draft in repo: [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md). TODO (owner) to review and paste into the form.
  - Name the track technology plainly: a simulated Alexa+ experience, the MCP endpoint and the Amazon Bedrock assistant ("Strong Submission Tips": "Make the required tool impossible to miss").
  - Don't add claims the repository can't back up. That includes customers, interviews, adoption, savings, performance figures, a production deployment or an Alexa connection.
- [ ] **Built With list.** — TODO (owner). Suggested entries, taken from what the code uses: Amazon Bedrock (Converse API, tool use), Claude Haiku 5.5 on Bedrock, Model Context Protocol, Web Speech API, React, Vite/Vinext, Cloudflare Workers runtime, D1, R2, TypeScript.
- [ ] **Final project name on Devpost.** — TODO (owner)
- [ ] **Team member names, and a Representative if entering as a team.** — TODO (owner)

## 4. Demo video

Rules, "Include a demonstration video", and the Overview page:

- [ ] Under 3 minutes. Judges are not required to watch beyond 3:00. Our script targets 2:30–2:45: [DEMO_SCRIPT.md](DEMO_SCRIPT.md). — Draft in repo; TODO (owner) to record
- [ ] In English. — TODO (owner)
- [ ] Uploaded to **YouTube or Vimeo** and publicly visible. Check that it plays in a signed-out browser. — TODO (owner)
- [ ] The video link is entered on the submission form. Video URL: **TODO (owner)**
- [ ] It shows the project working on its intended platform: the web app in a desktop browser. — TODO (owner)
- [ ] It clearly shows the simulated Alexa+ experience and says out loud that it is a simulation, not a connection to an Alexa device. — TODO (owner)
- [ ] It briefly shows the MCP client check ("Run MCP check (read-only)") and a Bedrock-backed assistant turn, followed by the human review and confirmation step. — TODO (owner)
- [ ] It contains **no Alexa or Alexa+ logo**. Plain-text "simulated Alexa+ experience" wording is fine. The organizer cannot approve logo use (Discussions: "Change of type of Project and logo permission"). A similar setup, plain-text "Simulated Alexa+" wording with no logo and no Alexa-like voice, was described as fine ("Ring Playground: Replay mode for judging…"). — TODO (owner)
- [ ] It contains no other third-party trademarks, copyrighted music or footage without permission. Use no music, or music you have the rights to. — TODO (owner)
- [ ] **Decision needed:** check on-screen third-party names and logos. Examples include the local sign-in button label ("Sign in with ChatGPT"), browser extensions, bookmarks and other tabs. One option is to start recording after sign-in.
- [ ] It shows no secrets or personal data: no `.env`, terminal with keys, AWS console account details or real email addresses. Use only the fictional demo orders. — TODO (owner)

## 5. GitHub repository and license

Rules, Submission Requirements; Overview, "What to Submit"; FAQs:

- [ ] **Create the GitHub repository and push.** This folder is not yet a git repository. Follow "Put the source on GitHub" in [README.md](../README.md). Repository URL: **TODO (owner)**
- [ ] **All source code, assets and instructions are included.** — Done in repo (local folder)
  - This includes `app/`, `lib/`, `components/`, `hooks/`, `db/`, `drizzle/`, `examples/`, `scripts/`, `tests/`, `public/`, `vendor/`, the maintained files in `build/`, `docs/`, `pnpm-lock.yaml` and `.env.example`.
  - TODO (owner): after `git add .`, check `git status --short` and confirm these paths are staged.
- [ ] **No credentials in the repository.** — Done in repo (`.gitignore`); TODO (owner) to verify before the first commit
  - `.gitignore` excludes `.env*` (except `.env.example`), `.dev.vars*`, `.wrangler/`, `.live-check/`, `dist/` and `node_modules/`.
  - Run `git check-ignore .env` and `git diff --cached --name-only`. Never force-add environment files.
  - If a key is ever committed, revoke it. Deleting the file later does not remove it from git history.
- [ ] **Decision needed:** whether to commit internal working files. These are `IDE_HANDOFF.md`, `ReceiveRight_VSCode_Agent_Prompt.txt` and `.openai/hosting.json`. The last one holds a Sites project ID, which is not a credential.
- [ ] **Decision needed:** whether to keep the hosted-site URL in README "Website and deployment". The site requires the owner's sign-in and is not a judge demo.
- Choose **one** access option:
  - [ ] **Option A, public repository with an open-source license.** — Partly done in repo
    - `LICENSE` (MIT, copyright 2026 Kumar Abhinav) is present and GitHub detects it as MIT. — Done
    - Rules: the license "should be detectable and visible at the top of the repository page (in the About section)". **TODO (owner):** after pushing, check that GitHub shows the license in the About sidebar.
    - Existing third-party notices are kept in `build/sites-vite-plugin.LICENSE` (MIT, OpenAI) and `vendor/shadcn-tailwind-4.13.0.LICENSE.md` (MIT, shadcn). — Done in repo
  - [ ] **Option B, private repository shared with the reviewers.** — Only if you don't use option A
    - Add collaborators under Settings > Collaborators > Add people.
    - Amazon reviewers: `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar`. The rules' sample sentence also lists `chris-trag`.
    - Devpost: `testing@devpost.com`.
    - Invitations expire after 7 days and each person must accept, so add the reviewers close to submission.
- [ ] **Decision needed:** choose option A or option B. The current preparation assumes option A.

## 6. Product Feedback (required)

The Rules require Product Feedback "for each tool, API, or SDK used in your project". For each tool, answer:

- which tools you used and for what
- what worked well
- what needs work
- onboarding (zero to hello world)
- whether you would build with it again (yes/no, and why)

- [ ] **Feedback for every tool actually used.** — Draft in repo: [PRODUCT_FEEDBACK.md](PRODUCT_FEEDBACK.md). TODO (owner) to review and paste.
  - Tools used: Amazon Bedrock (Converse API, tool use, Bedrock API keys, cross-Region inference profiles, Claude Haiku 5.5); the Model Context Protocol spec 2025-11-25 (our own server and a minimal client, no MCP SDK); the Web Speech API; ChatGPT Sites hosting (Cloudflare Worker runtime, D1, R2); Vinext/Vite; Wrangler/Miniflare; pnpm.
  - Don't review tools that were not used: Alexa Skills Kit, Alexa+ developer tools, AgentCore, Strands, Ring, Fire TV, Bee.
- [ ] **AWS Builder field: describe the AWS services used and how, inside the Product Feedback answer.** — Draft in repo; TODO (owner) to review
  - Service: Amazon Bedrock Runtime Converse API with tool use (toolConfig/toolSpec, toolUse/toolResult loop). The server calls it with a Bedrock API key (bearer token).
  - Model: the US cross-Region inference profile `us.anthropic.claude-haiku-5-5` in us-west-2.
  - No other AWS services are used. Hosting is not on AWS. Integration notes: [bedrock-setup.md](bedrock-setup.md).

## 7. Optional: friction log and feature requests

- [ ] **Friction log.** — Done in repo: [friction-log.md](friction-log.md). TODO (owner) to review.
  - Friction logs can earn up to a 10% judging bonus. Each entry needs: task, steps, expected vs actual, severity, workaround, suggestion.
  - Problems reported by the owner but not reproduced by us must stay attributed that way. Our own app bugs must not be presented as Amazon defects.
  - An organizer said a link in the description is enough, and that keeping the log in the repo makes it easier for judges (Discussions: "Inquiry about submission mechanics"). **TODO (owner):** link it in the description or form.
- [ ] **Feature requests.** — Decision needed. Each request needs a description, why it matters and a priority (Critical / Important / Nice-to-have).
  - Candidates come from observed problems in the friction log. For example:
    - Bedrock errors could name the matching inference profile when on-demand use of the bare model ID is rejected.
    - The console could show API key expiry more clearly.

## 8. New or existing project

- [ ] **State whether the project is new and, if it existed earlier, what changed during the Submission Period.** — TODO (owner) to confirm
  - Repository records show the first build on 2026-10-16, inside the Submission Period. This export has no git history.
  - **TODO (owner):** confirm that no version existed before August 31, 2026. If one did, the Rules require you to explain and demonstrate the significant updates. The FAQ suggests a clear before-and-after.
  - The description in [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) lists work completed during the hackathon window. Check it against your own records.

## 9. Judge run instructions and testing access

- [ ] **Setup and run instructions in the repository.** — Done in repo: [README.md](../README.md). TODO (owner) to re-read after the final edits.
  - README covers Node 24, pnpm 11.25.0, `pnpm install --frozen-lockfile`, `pnpm setup:local` and `pnpm dev`.
  - The app runs at `http://localhost:5173`. A local development sign-in uses a fictional user.
  - README also gives the demo flow, the Bedrock environment variable names and the checks.
- [ ] **Testing instructions on the form.** — TODO (owner)
  - Point to the README.
  - Say what works without AWS: manual receiving, guided input and the MCP check.
  - Say that the conversational assistant needs the tester's own Bedrock API key, region and inference profile, and that a live request may incur AWS charges.
- [ ] **Hosting.** — Decision needed
  - **FAQs:** "A locally runnable public repo plus your demo video is enough… hosting isn't required" and "Your MCP server doesn't need to stay running after you submit."
  - **Conflict:** in the Discussions thread "Question related to production being live of the Alexa+ MCP server", an organizer replied on about 2026-10-10: "It needs to be live and accessible till the end of the judging period."
  - The "locally runnable" FAQ answer appears in an archived copy from 2026-10-02. The "doesn't need to stay running" answer does not, so it was added later. Our copies don't show whether it came before or after the forum reply.
  - Options:
    - (a) Ask the organizers in Discussions or Discord and keep their answer.
    - (b) Rely on the FAQ and the simulated-experience path, with a locally runnable repository.
    - (c) Provide a hosted instance until Nov 20, 2026, 12:00 pm PT.
  - Related: in "Ring Playground: Replay mode for judging…", an organizer said judges should not be required to paste their own token. Consider this if judges would need their own Bedrock key.
- [ ] **If you provide a private hosted site for judges** — Decision needed; only applies to option (c):
  - Put test credentials **only in the Devpost testing instructions**. Never put them in the repository, README, video or screenshots. The Rules require login credentials for a private website.
  - The hosted Sites deployment authenticates through the Sites gateway. The browser MCP panel may get 401 there; this is documented and must not be bypassed.
  - Don't expose the compiled Worker directly on a public host without a trusted authentication boundary.
  - A server-side Bedrock key must stay valid through the end of judging. Short-term keys expire after 12 hours. If you use a longer-lived key, set an expiry after judging, watch costs (the app has no account-wide budget limit) and revoke the key afterwards.
- [ ] **Free access for testing.** — TODO (owner). The Rules require the project to be available "free of charge and without any restriction" for testing until the Judging Period ends.

## 10. Ownership and eligibility

These come from Rules sections 3 and 4 (Submission ownership, Intellectual Property, Financial or Preferential Support):

- [ ] **The Submission is your original work and solely owned by you (or your team or organization), and no other person or entity has rights in it.** — TODO (owner)
- [ ] **Employer intellectual property:** check any employment or contractor agreement for IP assignment clauses that could give an employer rights in this work. — TODO (owner)
- [ ] **Development tools:** the code was written with AI coding assistants and started from a Sites starter template (MIT notice kept). Confirm that the terms of the tools you used let you claim the output as your own work. The Rules allow third-party technical assistance only when the components remain the Entrant's work product and the Entrant owns all rights. — TODO (owner)
- [ ] **Authorized use of third-party SDKs, APIs and data under their terms:** Amazon Bedrock and model access terms, the browser speech service, and the open-source dependencies and their licenses. — TODO (owner)
- [ ] **Eligibility:** — TODO (owner)
  - You are at least the age of majority where you live.
  - You don't live in an excluded location: Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, or any other country comprehensively sanctioned by OFAC.
  - You are not an employee, representative or agent of the Sponsor (Amazon Developer), Devpost or another Promotion Entity or their affiliates, and not an immediate family or household member of one.
  - You are not a Judge and are not employed by a company that employs a Judge.
  - You have no other conflict of interest.
- [ ] **No financial or preferential support from the Sponsor or Devpost** for this project, such as funding, a development contract or a commercial license. — TODO (owner)

## 11. English materials

- [ ] All repository documentation is in English. — Done in repo
- [ ] The video, written description and testing instructions are in English. Otherwise, English translations are required. — TODO (owner)

## 12. Technical checks before recording

These are our own checks, not official requirements. They make sure the recorded demo matches the code. The numbers below are local results from 2026-10-17/18. Run the checks again on recording day.

| Command | What it checks | Needs | Last local result |
| --- | --- | --- | --- |
| `pnpm typecheck` | TypeScript | — | Pass |
| `pnpm lint` | ESLint | — | Pass |
| `pnpm test` | Unit tests: receiving math, demo runs, agent loop with fixtures, MCP client, dictation | — | 44 pass |
| `pnpm build` | Production Worker and browser assets | — | Pass |
| `pnpm test:worker` | Compiled Worker suites: receiving/auth/MCP/D1/R2, agent route with Bedrock fixtures, MCP client over HTTP | `pnpm build` first | 3 suites pass |
| `pnpm mcp:smoke` | Real MCP requests to the local server; compares with the website API | `pnpm dev` running | All checks pass; protocol 2025-11-25; 11 tools |
| `pnpm check:bedrock-live` | Live Bedrock scenarios | A valid Bedrock key; costs a small amount | 22/22 |

- [ ] **Fresh Bedrock key.** — TODO (owner)
  - Short-term keys expire. An expired key returns "Bearer Token has expired".
  - Update `AWS_BEARER_TOKEN_BEDROCK` in the ignored `.env` and restart `pnpm dev`.
  - Then click **Test connection** in the assistant panel, or ask "What is still outstanding?", and check the reply.
- [ ] **Physical microphone test.** — TODO (owner). **Not performed by the agent.**
  - The automated rehearsal used a simulated speech recognizer, not a microphone.
  - In the exact browser and on the exact machine you will record with:
    1. Open `http://localhost:5173`.
    2. Allow microphone access.
    3. Start dictation and say the full demo sentence, with a natural pause in the middle: "Ten cases of oat milk arrived in total, including one damaged. Prepare the receipt for review."
  - Confirm:
    - the whole sentence appears once, without being cut off after "including one damaged"
    - the text box is read-only and Send is disabled while listening
    - stopping keeps the text
    - nothing is sent automatically
  - Test both entry points: the assistant composer and guided input. If dictation fails, type the same sentence. Typed input uses the same path after the text is entered.
- [ ] **Fresh demo order.** — TODO (owner)
  - Open "Demo & integration" and choose "Start a fresh demo run", or open Receiving and choose "New demo run".
  - Expected arithmetic:
    - after delivery 1: 10 received including 1 damaged, so 9 accepted, 1 damaged, 2 undelivered
    - after delivery 2 (2 good cases): 12 received, 11 accepted, 1 damaged, 0 undelivered, 2 receipts
- [ ] **Browser MCP check.** — TODO (owner). Click "Run MCP check (read-only)" on the local site. It should show protocol 2025-11-25, 11 tools and "Identical data".
- [ ] **Recording setup.** — TODO (owner)
  - Close unrelated tabs, hide bookmarks and extensions, and turn off notifications.
  - Keep `.env` and terminals with keys off screen.
- [ ] **Rehearse timing below 3:00** with [DEMO_SCRIPT.md](DEMO_SCRIPT.md). — TODO (owner)

## Not yet submitted

None of the following has been done: pushing a GitHub repository, uploading the video, filling in the Devpost form or submitting. The project is not ready to submit until the owner actions below are complete.

### Remaining owner actions

1. Re-read the Rules and FAQs on Devpost and note any changes since 2026-10-17/18.
2. Decide on hosting. Ask the organizers about the FAQ versus forum conflict, or rely on the FAQ and the simulated path. If you host privately, prepare judge credentials for the testing instructions only.
3. Confirm sole ownership, the employer IP position, eligibility, no Sponsor support, and the terms of the development tools used.
4. Confirm that no version of ReceiveRight existed before August 31, 2026.
5. License holder set (Kumar Abhinav); the repository is public.
6. Decide whether to commit `IDE_HANDOFF.md`, `ReceiveRight_VSCode_Agent_Prompt.txt` and `.openai/hosting.json`, and whether README keeps the hosted URL.
7. Create the GitHub repository and push, after checking that `.env` is ignored and absent from the staged files. Check that the license shows in the About section. For a private repository, add the reviewers close to submission.
8. Generate a fresh Bedrock key, restart `pnpm dev` and run the checks in section 12.
9. Test the microphone physically in the recording browser.
10. Record the video in English, under 3 minutes, with no logos or unlicensed media. Upload it publicly to YouTube or Vimeo and test the link while signed out.
11. Review and paste the description ([SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md)), Product Feedback with AWS services ([PRODUCT_FEEDBACK.md](PRODUCT_FEEDBACK.md)), the friction log link ([friction-log.md](friction-log.md)), any feature requests, the new-or-existing statement and the testing instructions.
12. Select Alexa+ as the primary track and AWS Builder as the mini challenge. Enter the project name, team members, Built With list, GitHub URL and video URL.
13. Submit before Friday, October 23, 2026, 12:00 pm PT, then check that the entry appears as submitted on Devpost.
