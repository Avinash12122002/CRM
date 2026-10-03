# Complete WhatsApp Automation Architecture & Message Flow Guide
### TMS Visa CRM — Australia & Ireland Automated Candidate Funnels

---

## 1. System Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │             Meta Cloud API              │
                      │       (WhatsApp Business Platform)      │
                      └────────────────────┬────────────────────┘
                                           │ Webhook POST
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │    /api/whatsapp/webhook/route.ts       │
                      │    (Unified Australia & Ireland Router) │
                      └───────┬─────────────────────────┬───────┘
                              │                         │
         Meta Phone ID = AU   │                         │ Meta Phone ID = IE
         or AU session/button │                         │ (or ends in 8685081010)
                              ▼                         ▼
            ┌───────────────────────────┐    ┌───────────────────────────┐
            │   Australia Funnel        │    │    Ireland Funnel         │
            │   (lib/whatsapp/)         │    │    (lib/whatsapp-ireland/)│
            └─────────────┬─────────────┘    └─────────────┬─────────────┘
                          │                                │
                          ├────────────────────────────────┤
                          │ Auto-Creates CRM Lead in DB    │
                          │ status: "new-lead"             │
                          │ links session.leadId           │
                          ▼                                ▼
            ┌───────────────────────────┐    ┌───────────────────────────┐
            │  State Machine (AU)       │    │  State Machine (IE)       │
            │  482 Work Visa Flow       │    │  Ireland Work Permit Flow │
            └─────────────┬─────────────┘    └─────────────┬─────────────┘
                          │                                │
                          ├────────────────────────────────┤
                          │  Cron Follow-Up Engine         │
                          │  (10-Min, 1-Hr, Day 1 - Day 7) │
                          ▼                                ▼
            ┌────────────────────────────────────────────────────────────┐
            │       CRM Database (MongoDB: leads, sessions, messages)    │
            │       Admin Dashboard: /dashboard/whatsapp(-ireland)       │
            └────────────────────────────────────────────────────────────┘
```

---

## 2. Inbound Message Reception & Routing

### 2.1 The Webhook Endpoints
- **Primary Endpoint:** `POST /api/whatsapp/webhook` (Handles both Australia and Ireland).
- **Dedicated Ireland Endpoint:** `POST /api/whatsapp-ireland/webhook` (Dedicated fallback for Ireland Meta configuration).
- **Handshake Verification (GET):** Verifies Meta `hub.mode === "subscribe"` and `hub.verify_token`.

### 2.2 How the Channel is Identified
When an incoming message arrives, the system examines:
1. `metadata.phone_number_id`: If it matches `WHATSAPP_IRELAND_PHONE_NUMBER_ID` (default: `1366657749867122`) or `metadata.display_phone_number` ends with `8685081010`, it routes to **Ireland**.
2. If it matches `WHATSAPP_PHONE_NUMBER_ID`, it routes to **Australia**.
3. If neither matches, it inspects interactive button payloads (e.g., `BTN_IRELAND_*`) or existing database sessions.

### 2.3 Instant CRM Lead Creation (Rule: First Message = New Lead)
Every incoming message runs this sequence:
1. **Phone Normalization:** Clean digits only (`cleanPhone`), stripping `+`, spaces, dashes, leading `00`.
2. **Duplicate Check:** Checks `leads` collection for `phone`, `+phone`, last 10 digits regex, and numeric representation.
3. **If NO lead exists:**
   - **Immediately auto-creates CRM Lead** in `leads` collection.
   - `status`: `"new-lead"`
   - `name`: Candidate's verified profile name from WhatsApp, or fallback `"WhatsApp Candidate (+<phone>)"`.
   - `country`: Detected from dial code (or "Australia" / "Ireland").
   - `interestedCountry`: `"Australia"` or `"Ireland"`.
   - `jobApplied`: 
     - Australia: `"Australia Employer Sponsored Work Visa"`
     - Ireland: `"Ireland Work Visa (Critical Skills & General Employment)"`
   - `leadSource`: `"WhatsApp Ad Automation"` (AU) or `"WhatsApp Ireland"` (IE).
   - `assignedTo`: For Ireland, automatically assigns to **Pearl** if available.
   - `session.leadId`: Linked immediately so the session and CRM lead are 1:1 tied.
4. **If lead already exists:**
   - Links `session.leadId = existingLead.id`.
   - If lead name was a placeholder (`"Candidate"`) and candidate's WhatsApp profile name is now verified, updates `lead.name`.

---

## 3. Australia 482 Work Visa Automation Flow

### Step 1: `WELCOME`
- **When sent:** When a candidate messages for the first time or clicks an Australia Meta Ad.
- **Message sent:**
  > *"Hi {{CandidateName}}! 👋 Welcome to **TMS Visa** (The Migration School).*\n\n*Are you looking for an Employer-Sponsored Work Visa (Subclass 482 / 186 / 494) for Australia? 🇦🇺*"
- **Quick Reply Buttons:**
  - `[Yes, I'm Interested 🇦🇺]` (`BTN_482_YES`)
  - `[Not Now]` (`BTN_482_NO`)
- **Next Step:** Moves to `AWAITING_EMAIL`.

---

### Step 2: `AWAITING_EMAIL`
- **When sent:** Candidate taps *"Yes, I'm Interested"* or provides their job title / trade.
- **Message sent:**
  > *"Great! To send you our complete **Australia Employer Sponsored Work Visa Process Guide**, please share your **Email Address**: 📩*\n\n*(Type your email below)*"
- **Candidate action:** Types their email address (e.g. `john@example.com`).
- **Validation:** Strict regex validation `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/`.
- **System Action upon Valid Email:**
  1. Updates `session.email` and `lead.email`.
  2. Sends instant confirmation WhatsApp message:
     > *"We have sent an email about the whole process to your email address ({{email}})! Please check your inbox (and spam/junk folder) as well. 📩"*
  3. Dispatches automated branded HTML email via Nodemailer (`info@tmsvisa.com`).
  4. Moves to **`VIDEO_SENT_AWAITING_INTEREST`**.

---

### Step 3: Explainer Video Guide (`VIDEO_SENT_AWAITING_INTEREST`)
- **When sent:** Immediately following email confirmation.
- **Message sent:**
  > *"🎥 *Australia Work Visa — Process Guide Video* 🇦🇺\n\n*Here is our video explaining employer sponsorship requirements, eligible occupations, and relocation pathways:\n\n▶️ *Watch the Video Here:*\n{{VIDEO_482_URL}}\n\n*(Tap the link above to watch the video anytime)*"*
- **Timer Scheduled:** Sets a **10-minute timer** (`consultationPromptDueAt = Date.now() + 10 mins`).

---

### Step 4: 10-Minute Consultation Prompt (`AWAITING_CONSULTATION_DECISION`)
- **When sent:** 10 minutes after video delivery (executed by timer or background cron engine).
- **Message sent:**
  > *"**Ready to take the next step towards Australia? 🇦🇺**\n\nBook a 1-on-1 consultation meeting with our Australian Visa Expert to check your job eligibility and visa pathway."*
- **Quick Reply Buttons:**
  - `[Book Consultation]` (`BTN_CONSULT_YES`)
  - `[Maybe Later]` (`BTN_CONSULT_NO`)

---

### Step 5: Day Selection (`SELECTING_DAY`)
- **When sent:** Candidate clicks *"Book Consultation"*.
- **No Day Filtering:** Shows all **8 weekend dates** directly (Sat, Sun, Sat, Sun across 4 upcoming weekends) in a single Meta Interactive List.
- **Candidate Local Timing:** Strict candidate local timezone. **Never mentions IST or Indian timing**.
- **Message sent:**
  > *"Our 1-on-1 consultations with our senior visa experts are held on **Saturdays and Sundays**.\nAll 1-on-1 sessions run in 1-hour intervals between **{{LocalStartTime}} – {{LocalEndTime}} ({{CandidateLocalTimezone}})**.\n\nPlease select your preferred date from the 8 upcoming weekend days below:"*
- **Interactive List (8 Days):**
  - Section: *"8 Weekend Dates"*
  - Day 1: `Sat, 10 Oct` (Saturday · 1-Hour Slots)
  - Day 2: `Sun, 11 Oct` (Sunday · 1-Hour Slots)
  - Day 3: `Sat, 17 Oct` (Saturday · 1-Hour Slots)
  - Day 4: `Sun, 18 Oct` (Sunday · 1-Hour Slots)
  - Day 5: `Sat, 24 Oct` (Saturday · 1-Hour Slots)
  - Day 6: `Sun, 25 Oct` (Sunday · 1-Hour Slots)
  - Day 7: `Sat, 31 Oct` (Saturday · 1-Hour Slots)
  - Day 8: `Sun, 01 Nov` (Sunday · 1-Hour Slots)
- **Candidate Action:** Taps any of the 8 dates.

---

### Step 6: Slot Selection (`SELECTING_SLOT`)
- **When sent:** Immediately after candidate taps any of the 8 days.
- **Total 8 Slots (1-Hour Intervals):**
  - Runs in exactly 8 slots between 1:00 PM and 9:00 PM (1-hour each).
  - Strictly converted and formatted in **Candidate's country / local time only**.
  - **Zero mention of IST or Indian timing** in any candidate-facing messages.
- **Message sent:** Meta Interactive List Menu displaying the 8 available 1-hour consultation slots:
  - *Slot 1:* `1:00 PM - 2:00 PM (WAT)`
  - *Slot 2:* `2:00 PM - 3:00 PM (WAT)`
  - *Slot 3:* `3:00 PM - 4:00 PM (WAT)`
  - *Slot 4:* `4:00 PM - 5:00 PM (WAT)`
  - *Slot 5:* `5:00 PM - 6:00 PM (WAT)`
  - *Slot 6:* `6:00 PM - 7:00 PM (WAT)`
  - *Slot 7:* `7:00 PM - 8:00 PM (WAT)`
  - *Slot 8:* `8:00 PM - 9:00 PM (WAT)`
- **Candidate action:** Taps a slot in the interactive dropdown.

---

### Step 7: Booking Confirmed (`BOOKED`)
- **When sent:** Candidate selects a time slot.
- **Candidate-Facing Time Rule:** Shows **ONLY the candidate's country local time**. No IST.
- **System Actions:**
  1. Locks slot in `meetingSlots` collection.
  2. Updates `lead.status = "meeting-scheduled"`.
  3. Stores meeting details: date, time, Google Meet link.
- **Message sent:**
  > *"Dear {{CandidateName}},\n\nThank you for showing your interest in the *Australia Employer Sponsored Work Visa*.\n\nWe are pleased to invite you to a *Google Meet session* to discuss the visa process, eligibility, requirements, and further details.\n\n📅 *Date:* {{FormattedDate}}\n⏰ *Time:* {{CandidateLocalTime}} ({{CandidateLocalTimezone}})\n💻 *Google Meet:* {{MeetLink}}\n\nPlease make sure to *join the meeting on time*.\n\nWe look forward to speaking with you.\n\n*Best regards,*\n*TMS Visa*"*

---

### Step 8: Pre-Meeting Reminders
- **When sent:** **1 Hour before** the meeting start time.
- **Candidate-Facing Time Rule:** Formatted strictly in candidate's local country time.
- **Message sent:**
  > *"⏰ *Reminder: Your Australian Visa Consultation is in 1 Hour!*\n\n📅 *Date:* {{Date}}\n⏰ *Time:* {{CandidateLocalTime}} ({{CandidateLocalTimezone}})\n\n🔗 *Google Meet Link:*\n{{MeetLink}}\n\nOur Australian visa specialist is ready to evaluate your Australia Employer Sponsored Work Visa file. Please tap the link to join on time! 🇦🇺"*

---

### Step 9: 7-Day Follow-Up Sequence (With Dynamic Interactive Attachment)
- **When sent:** Every morning at **10:00 AM in the candidate's local timezone**.
- **Rule for Incomplete Bookings:**
  - **If Date is NOT selected yet:** Every 7-day follow-up message automatically attaches the **Interactive 8-Day Selection List ("Select Date")**!
  - **If Date IS selected but Slot is NOT selected yet:** Every 7-day follow-up message automatically attaches the **Interactive 8-Slot Selection List ("Select Slot")**!
- **Progression:**
  - **Day 1:** Friendly check-in + attached Date/Slot selector.
  - **Day 2:** Highlighting in-demand occupations + attached Date/Slot selector.
  - **Day 3:** Addressing common questions + attached Date/Slot selector.
  - **Day 4:** Urgency on visa quota + attached Date/Slot selector.
  - **Day 5:** Direct invitation to speak with a specialist + attached Date/Slot selector.
  - **Day 6:** Final reminder before file archival + attached Date/Slot selector.
  - **Day 7:** Closing file notice with opt-in reactivation.
### Step 10: Meeting Completed & Post-Meeting CV Intake (`AWAITING_CV`)
- **When sent:** When meeting status is updated to `completed` in CRM (or candidate attends 1-on-1 session).
- **Message sent:**
  > *"Thanks for attending the meeting. We hope that you enjoyed the meeting with our expert. Now, our review team will review your CV to match the requirements of Australian Employers! 🇦🇺\n\nPlease send your CV / Resume here in PDF or Word document format. 📄"*
- **Candidate action:** Uploads their CV/Resume file on WhatsApp.
- **System Action upon CV upload:**
  1. Stores PDF/Word file in MongoDB GridFS (`chatFiles`).
  2. Updates CRM lead document (`hasCv: true`, `cvFiles[]`, notes).
  3. Updates session (`hasUploadedCv: true`, `nextFollowupAt: null`), transitions to `MEETING_COMPLETED`.
  4. Dispatches confirmation: *"✅ Thank you! We have received your CV / Resume. Our evaluation team is reviewing your profile against active Australian employer sponsorships."*

---

### Step 11: Meeting Cancellation & Rescheduling Flow
- **When sent:** When candidate requests cancellation in chat or meeting is marked `cancelled` in CRM.
- **System Actions:**
  1. Unlocks the reserved time slot in `meetingSlots` collection immediately for other candidates.
  2. Appends cancellation record to `meetingHistory`.
  3. Updates session (`meetingStatus: "canceled"`, `currentStep: "RESCHEDULING_DATE"`).
- **Message sent:**
  > *"Unfortunately your consultation meeting could not take place with us today.\n\nPlease reschedule your meeting with us by choosing an available date below:"*
- **Action Attached:**
  - Automatically dispatches Meta Interactive List with upcoming dates (`"Select Date"`).
  - Fallback Quick Reply Button: `[Reschedule Meeting]` (`BTN_RESCHEDULE_MEETING`).
- **Rescheduling:** Tapping any date or `BTN_RESCHEDULE_MEETING` immediately brings up the date/slot picker to confirm a new time.

---

## 4. Ireland General Employment & Critical Skills Automation Flow

### Step 1: `WELCOME`
- **When sent:** First message to the Ireland WhatsApp line (or when candidate says hi/hello/restart).
- **Lead Created:** Auto-created CRM lead with `interestedCountry: "Ireland"`, `leadSource: "WhatsApp Ireland"`, auto-assigned to **Pearl**.
- **No Fees Mentioned:** Fees are strictly **never mentioned** in the welcome message.
- **Message sent:**
  > *"Hello ☺️! Welcome to The Migration School (TMS Visa) 🇮🇪.\nWe specialize in employer-sponsored work visas for Ireland.\n\*We have received your enquiry for Ireland Employer Sponsored Work Visa, to know all the details ,choose Insterested\*"*
- **Quick Reply Buttons (Exactly 2 Buttons):**
  - `[Yes, Interested]` (`BTN_IRELAND_YES`)
  - `[Not Right Now]` (`BTN_IRELAND_NO`)
- **Next Step:** Moves to `AWAITING_EMAIL`.

---

### Step 2: `AWAITING_EMAIL`
- **When sent:** Candidate taps *"Yes, Interested"* or provides their profession.
- **Message sent:**
  > *"Great! To send you our complete **Ireland Employer Sponsored Work Visa Process Guide**, please share your **Email Address**: 📩\n\n*(Type your email below)*"*
- **Candidate action:** Types their email address (e.g. `jane@example.com`).
- **Validation:** Strict regex validation `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/`.
- **System Action upon Valid Email:**
  1. Updates `session.email` and `lead.email`.
  2. Sends instant confirmation WhatsApp message:
     > *"We have sent an email about the whole process to your email address ({{email}})! Please check your inbox (and spam/junk folder) as well. 📩"*
  3. Dispatches automated branded HTML Ireland Information Pack email via Nodemailer (`info@tmsvisa.com`).
  4. Moves to **`VIDEO_SENT_AWAITING_INTEREST`**.

---

### Step 3: Explainer Video Guide (`VIDEO_SENT_AWAITING_INTEREST`)
- **When sent:** Immediately following email confirmation (after 2 seconds).
- **Message sent:**
  > *"🎥 *Ireland Work Visa — Process Guide Video* 🇮🇪\n\n*Here is our video explaining employer sponsorship requirements, eligible occupations, and relocation pathways:\n\n▶️ *Watch the Video Here:*\n{{VIDEO_IRELAND_URL}}\n\n*(Tap the link above to watch the video anytime)*"*
- **Timer Scheduled:** Sets a **10-minute timer** (`consultationPromptDueAt = Date.now() + 10 mins`).

---

### Step 4: 10-Minute Consultation Prompt (`AWAITING_CONSULTATION_DECISION`)
- **When sent:** 10 minutes after video delivery (executed by timer or background cron engine).
- **Message sent:**
  > *"**Ready to take the next step towards Ireland? 🇮🇪**\n\nBook a 1-on-1 consultation meeting with our Ireland Visa Expert to check your job eligibility and visa pathway."*
- **Quick Reply Buttons:**
  - `[Book Consultation]` (`BTN_CONSULT_YES`)
  - `[Maybe Later]` (`BTN_CONSULT_NO`)

---

### Step 5: Day Selection (`SELECTING_DAY`)
- **When sent:** Candidate clicks *"Book Consultation"*.
- **Ireland Specifics (Mon–Fri Weekdays):** Consultations run on **weekdays (Monday to Friday)**.
- **Direct 5-Day Interactive List:** Shows all **5 upcoming weekdays** directly (Mon, Tue, Wed, Thu, Fri) in a single Meta Interactive List.
- **Candidate Local Timing:** Strict candidate local timezone. **Never mentions IST or Indian timing**.
- **Message sent:**
  > *"Our 1-on-1 consultations with our senior visa experts are held on **Monday to Friday**.\nAll 1-on-1 sessions run in 1-hour intervals between **{{LocalStartTime}} – {{LocalEndTime}} ({{CandidateLocalTimezone}})**.\n\nPlease select your preferred date from the 5 upcoming weekdays below:"*
- **Interactive List (5 Weekdays):**
  - Section: *"5 Weekdays (Mon-Fri)"*
  - Day 1: `Mon, 05 Oct` (Monday · 1-Hour Slots)
  - Day 2: `Tue, 06 Oct` (Tuesday · 1-Hour Slots)
  - Day 3: `Wed, 07 Oct` (Wednesday · 1-Hour Slots)
  - Day 4: `Thu, 08 Oct` (Thursday · 1-Hour Slots)
  - Day 5: `Fri, 09 Oct` (Friday · 1-Hour Slots)
- **Candidate Action:** Taps any of the 5 weekdays.

---

### Step 6: Slot Selection (`SELECTING_SLOT`)
- **When sent:** Immediately after candidate taps any of the 5 weekdays.
- **Total 8 Slots (12:00 PM – 8:00 PM, 1-Hour Intervals):**
  - Runs in exactly 8 slots between 12:00 PM and 8:00 PM (1-hour each).
  - Strictly converted and formatted in **Candidate's country / local time only**.
  - **Zero mention of IST or Indian timing** in any candidate-facing messages.
- **Message sent:** Meta Interactive List Menu displaying the available 1-hour consultation slots:
  - *Slot 1:* `12:00 PM - 1:00 PM (Local TZ)`
  - *Slot 2:* `1:00 PM - 2:00 PM (Local TZ)`
  - *Slot 3:* `2:00 PM - 3:00 PM (Local TZ)`
  - *Slot 4:* `3:00 PM - 4:00 PM (Local TZ)`
  - *Slot 5:* `4:00 PM - 5:00 PM (Local TZ)`
  - *Slot 6:* `5:00 PM - 6:00 PM (Local TZ)`
  - *Slot 7:* `6:00 PM - 7:00 PM (Local TZ)`
  - *Slot 8:* `7:00 PM - 8:00 PM (Local TZ)`
- **Candidate action:** Taps a slot in the interactive dropdown.

---

### Step 7: Booking Confirmed (`BOOKED`)
- **When sent:** Candidate selects a time slot.
- **Host:** Dedicated Ireland Migration Desk (Pearl).
- **Candidate-Facing Time Rule:** Shows **ONLY the candidate's country local time**. No IST.
- **System Actions:**
  1. Locks slot in `meetingSlots` collection under channel `"WhatsApp Ireland"`.
  2. Updates `lead.status = "meeting-scheduled"`, assigns to Pearl.
  3. Stores meeting details: date, time, Google Meet link.
- **Message sent:**
  > *"Dear {{CandidateName}},\n\nThank you for showing your interest in the *Ireland Employer Sponsored Work Visa*.\n\nWe are pleased to invite you to a *Google Meet session* to discuss the visa process, eligibility, requirements, and further details.\n\n📅 *Date:* {{FormattedDate}}\n⏰ *Time:* {{CandidateLocalTime}}\n💻 *Google Meet:* {{MeetLink}}\n\nPlease make sure to *join the meeting on time*.\n\nWe look forward to speaking with you.\n\n*Best regards,*\n*TMS Visa*"*

---

### Step 8: Pre-Meeting Reminders
- **When sent:** **1 Hour before** the meeting start time.
- **Candidate-Facing Time Rule:** Formatted strictly in candidate's local country time.
- **Message sent:**
  > *"⏰ *Reminder: Your Ireland Visa Consultation is in 1 Hour!*\n\n📅 *Date:* {{Date}}\n⏰ *Time:* {{CandidateLocalTime}}\n\n🔗 *Google Meet Link:*\n{{MeetLink}}\n\nOur Ireland visa specialist is ready to evaluate your Ireland Employer Sponsored Work Visa file. Please tap the link to join on time! 🇮🇪"*

---

### Step 9: 7-Day Follow-Up Sequence (With Dynamic Interactive Attachment)
- **When sent:** Every morning at **10:00 AM in the candidate's local timezone**.
- **Rule for Incomplete Bookings:**
  - **If Date is NOT selected yet:** Every 7-day follow-up message automatically attaches the **Interactive 5-Day Weekday Selection List ("Select Date")**!
  - **If Date IS selected but Slot is NOT selected yet:** Every 7-day follow-up message automatically attaches the **Interactive 8-Slot Selection List ("Select Slot")**!
- **Progression:** 7-day high-converting sequence focusing on employer sponsorship, Critical Skills PR benefits, and booking a consultation. (Zero fee mentions in early follow-ups).
- **Stop Condition:** Stops immediately if candidate books a consultation or changes status in CRM (`meeting-scheduled`, `follow-up`, `sales`, etc.).

---

### Step 10: Meeting Completed & Post-Meeting CV Intake (`AWAITING_CV`)
- **When sent:** When meeting status is updated to `completed` in CRM (or candidate attends 1-on-1 session).
- **Message sent:**
  > *"Thanks for attending the meeting. We hope that you enjoyed the meeting with our expert. Now, our review team will review your CV to match the requirements of Irish Employers! 🇮🇪\n\nPlease send your CV / Resume here in PDF or Word document format. 📄"*
- **Candidate action:** Uploads their CV/Resume file on WhatsApp.
- **System Action upon CV upload:**
  1. Stores PDF/Word file in MongoDB GridFS (`chatFiles`).
  2. Updates CRM lead document (`hasCv: true`, `cvFiles[]`, notes).
  3. Updates session (`hasUploadedCv: true`, `nextFollowupAt: null`), transitions to `MEETING_COMPLETED`.
  4. Dispatches confirmation: *"✅ Thank you! We have received your CV / Resume. Our evaluation team is reviewing your profile against active Irish employer sponsorships."*

---

### Step 11: Meeting Cancellation & Rescheduling Flow
- **When sent:** When candidate requests cancellation in chat or meeting is marked `cancelled` in CRM.
- **System Actions:**
  1. Unlocks the reserved time slot in `meetingSlots` collection immediately for other candidates.
  2. Appends cancellation record to `meetingHistory`.
  3. Updates session (`meetingStatus: "canceled"`, `currentStep: "RESCHEDULING_DATE"`).
- **Message sent:**
  > *"Unfortunately your consultation meeting could not take place today.\n\nPlease reschedule your consultation with our Ireland expert by choosing an available date below:"*
- **Action Attached:**
  - Automatically dispatches Meta Interactive List with 5 upcoming weekdays (`"Select Date"`).
  - Fallback Quick Reply Button: `[Reschedule Meeting]` (`BTN_RESCHEDULE_MEETING`).
- **Rescheduling:** Tapping any weekday date or `BTN_RESCHEDULE_MEETING` immediately brings up the weekday date/slot picker (12:00 PM – 8:00 PM) to confirm a new time.

---

## 5. Intelligent AI Fallback (Natural Language Q&A)

If a candidate asks open-ended questions at any point in the funnel (e.g., *"Can I bring my family?"*, *"What is the English requirement?"*, *"How much salary will I get?"*, *"Is food and accommodation provided?"*):

1. **AI Interceptor:** The message is sent to `generateAiResponse()` ([ai.ts](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/ai.ts)).
2. **Context Grounding:** The AI receives the candidate's current state, country, program rules, and TMS Visa factual answers.
3. **Factual Response:** Generates a concise, professional answer (1-3 sentences max).
4. **Funnel Retention:** The AI answers the question, then automatically re-attaches the current prompt buttons so the candidate stays in the conversion funnel.

---

## 6. Summary of Database Collections Used

| Collection | Role in WhatsApp System | Key Data Stored |
|---|---|---|
| `leads` | Central CRM candidate database | `id`, `name`, `phone`, `status`, `leadSource`, `assignedTo`, `notes[]`, `history[]` |
| `whatsapp_sessions` | Australia candidate chat state | `phone`, `name`, `currentStep`, `leadId`, `followupCount`, `bookedSlot`, `email` |
| `whatsapp_ireland_sessions` | Ireland candidate chat state | `phone`, `name`, `currentStep`, `leadId`, `cvFileUrl`, `interestedCountry: "Ireland"` |
| `whatsapp_messages` | Australia full conversation history | `phone`, `sender` ("candidate"\|"bot"\|"admin"), `text`, `msgType`, `mediaUrl`, `createdAt` |
| `whatsapp_ireland_messages` | Ireland full conversation history | `phone`, `sender`, `text`, `msgType`, `mediaUrl`, `createdAt` |
| `whatsapp_incoming_logs` | Raw Meta webhook audit trail | `phone`, `senderName`, `rawMessage`, `msgType`, `createdAt` |
| `meetingSlots` | Consultation slots & availability | `meetingDate`, `istStartTime`, `candidateStartTime`, `status` ("booked"\|"available"), `phone` |
| `counters` | Atomic integer ID sequences | `_id: "leads"`, `seq` |
