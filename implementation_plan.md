# Implementation Plan: 100% WhatsApp Ad-to-Meeting Automation & Context-Aware Meta AI

This plan maps out the complete automation of your candidate lifecycle directly on WhatsApp, replacing manual telecaller qualification, manual time-slot negotiation, and manual timezone calculation, while syncing seamlessly with your CRM and assigning consultations directly to **Abhay**.

---

## 1. Complete Workflow Comparison

```mermaid
flowchart TD
    subgraph PREVIOUS ["Previous Manual Process"]
        P1["Lead clicks Ad on Insta/WhatsApp"] --> P2["Telecaller manually checks CRM for duplicate"]
        P2 --> P3["Telecaller dials number & explains 482 visa"]
        P3 --> P4["Telecaller manually sends video & text via WhatsApp"]
        P4 --> P5["Manual back-and-forth about available times"]
        P5 --> P6["Telecaller manually calculates candidate country timezone"]
        P6 --> P7["Telecaller books slot in IST in CRM & assigns to Meeting user"]
        P7 --> P8["Telecaller manually sends WhatsApp message with Meet link"]
        P8 --> P9["Meeting completed -> Lead handed to Follow-Up user"]
    end

    subgraph NEW ["New 100% Automated WhatsApp & AI Process"]
        N1["Candidate clicks Ad & sends WhatsApp message"] --> N2["Bot prompts: Interested in Australia 482 Visa? (Yes/No)"]
        N2 -->|Yes| N3["Bot requests Email Address"]
        N2 -->|No| N_REM["Reminder sent every 2 days for 6 days (Day 2, 4, 6)"]
        N3 --> N4["Lead auto-saved in CRM (Phone, Email, Australia, Country)"]
        N4 --> N5["Video sent immediately"]
        N5 -->|After 10 seconds| N6["Process Guide message sent"]
        N6 -->|After 10 seconds| N7["Prompt: Book free live session with Visa Expert?"]
        N7 -->|Yes| N8["Show available Sat/Sun 30-min slots (11am-7pm IST converted to Candidate Local Time)"]
        N7 -->|No| N_REM
        N8 --> N9["Candidate books slot -> Locked in CRM -> Assigned to Abhay"]
        N9 --> N10["Instant WhatsApp confirmation sent with Google Meet link & local time"]
        N10 --> N11["Automated reminder sent 1 hour before meeting"]
        N11 --> N12["Abhay conducts meeting on Google Meet & marks Complete in CRM"]
        N12 --> N13["Lead transfers to Follow-Up user"]
        N13 -->|If Payment Pending| N14["Automated reminder sent every 2 days until paid"]
        
        AI["Context-Aware Meta AI Counselor"] -.->|Answers any candidate question 24/7 knowing their exact meeting & payment status| NEW
    end
```

---

## 2. Core Functional Modules & Exact Specifications

### Module 1: Inbound Lead Capture & Immediate CRM Sync
* **Trigger:** Candidate arrives via Meta Ad click or sends initial WhatsApp message (*"Hi"*, *"Saw your 482 ad"*).
* **Step 1 — Qualification:**
  * Message: *"Welcome to The Migration School (TMS Visa) 🇦🇺. Are you interested in the Australia Subclass 482 Work Visa?"*
  * Interactive Quick Reply: `[Yes, I'm Interested]` | `[Not Right Now]`.
  * If `[Not Right Now]`: Triggers the **6-Day Re-engagement Loop** (every 2 days).
* **Step 2 — Email Capture:**
  * Message: *"Great! Please share your Email Address so we can register your profile and send you the complete 482 sponsorship guide."*
  * Validates email format.
* **Step 3 — Automatic CRM Lead Creation:**
  * Instantly queries CRM `leads` collection by phone number.
  * If lead already exists: updates record with the new email.
  * If new: creates lead with integer `id`:
    * `name`: Candidate WhatsApp profile name.
    * `phone`: Candidate phone number (e.g. `+234...`, `+971...`).
    * `email`: Captured email.
    * `country`: Detected from phone dial code (e.g. Nigeria, UAE, UK).
    * `interestedCountry`: `"Australia"` (by default).
    * `jobApplied`: `"Subclass 482 Work Visa"`.
    * `leadSource`: `"WhatsApp Ad Automation"`.
    * `status`: `"new-lead"`.

---

### Module 2: The Timed Information Sequence (10-Second Delays)
Once the email is captured, the system delivers the knowledge in a timed, digestible cadence:
1. **At 0 seconds (Immediate):**
   * Dispatches the **Subclass 482 Explainer Video** with caption:  
     *🇦🇺 "Australia Subclass 482 Work Visa Process Guide by The Migration School"*
2. **At 10 seconds:**
   * Dispatches the **Comprehensive Process Information Message**:
     * Highlights of employer sponsorship pathways.
     * Minimum 2 years of verifiable work experience required.
     * Full work rights for spouse + schooling for dependent children.
     * Direct 2-year pathway to Australian Permanent Residency (PR Subclass 186).
3. **At 20 seconds (10 seconds after the info):**
   * Dispatches the **Consultation Offer Prompt**:
     * *"Would you like to know more about our processes and evaluate your profile live? Book a free 1-on-1 consultation with our senior visa expert."*
     * Interactive Buttons: `[📅 Book Free Consultation]` | `[Maybe Later]`.
     * If `[Maybe Later]`: Enters the **6-Day Re-engagement Loop**.

---

### Module 3: Weekend Slot Engine (11:00 AM – 07:00 PM IST) & Timezone Translation
* **Weekend Rule:** Consultations are held strictly on **Saturdays and Sundays**.
* **Time Range:** **11:00 AM to 07:00 PM Indian Standard Time (IST)** in **30-minute intervals**:
  * `11:00 - 11:30`, `11:30 - 12:00`, `12:00 - 12:30`, `12:30 - 13:00`, `13:00 - 13:30`, `13:30 - 14:00`, `14:00 - 14:30`, `14:30 - 15:00`, `15:00 - 15:30`, `15:30 - 16:00`, `16:00 - 16:30`, `16:30 - 17:00`, `17:00 - 17:30`, `17:30 - 18:00`, `18:00 - 18:30`, `18:30 - 19:00` (16 total slots per day).
* **Real-time Conflict Checking:**
  * Queries MongoDB `meetingSlots` for the chosen weekend date.
  * Any slot that is already booked (`scheduled` or `completed`) is **completely hidden** from the candidate's list.
* **Country Timezone Translation:**
  * Auto-detects candidate country from phone prefix:
    * Nigeria (`+234`) $\to$ **WAT (UTC+1)** — Nigeria is 4.5 hours behind India.
    * UAE (`+971`) $\to$ **GST (UTC+4)** — UAE is 1.5 hours behind India.
    * United Kingdom (`+44`) $\to$ **GMT/BST (UTC+0 / UTC+1)**.
    * India (`+91`) $\to$ **IST (UTC+5:30)**.
  * **Candidate View:** Candidate in Nigeria sees: `04:30 PM - 05:00 PM (Nigeria Time)`.
  * **CRM / Abhay View:** CRM records and displays: `09:00 PM - 09:30 PM (IST)`.

---

### Module 4: Booking Lock, Assignment to "Abhay" & Static Meet Link
When candidate selects their slot:
1. **Lock Slot in CRM:**
   * Inserts slot into `meetingSlots` (`status: "scheduled"`).
2. **Assign to Consultant Abhay:**
   * Looks up user with `username: "Abhay"` in `users` collection.
   * Updates lead in `leads`:
     * `status: "meeting-scheduled"`
     * `meetingStatus: "scheduled"`
     * `assignedTo: abhayUser.id`
     * `assignedToName: abhayUser.name`
     * `assignedToRole: "meeting"`
     * `meetingDetails`:
       * `meetingDate`: Selected date (YYYY-MM-DD)
       * `startTime`: IST Start Time (e.g. `21:00`)
       * `endTime`: IST End Time (e.g. `21:30`)
       * `meetingUserId`: `abhayUser.id`
       * `meetingUserName`: `abhayUser.name`
       * `candidateTimezone`: Candidate local timezone (e.g. `Africa/Lagos`)
       * `candidateLocalTime`: Candidate local start time (e.g. `16:30`)
       * `googleMeetLink`: Configured static room link.
3. **Instant WhatsApp Confirmation:**
   * Sends candidate confirmation message with:
     * Confirmed Date & Time in **Candidate's local time** (e.g. `04:30 PM WAT`).
     * The **Static Google Meet Link** (`https://meet.google.com/xxx-yyyy-zzz`).
     * Guidance: *"Please have your updated CV/Resume ready for the call."*
4. **1-Hour Pre-Meeting WhatsApp Reminder:**
   * Automated cron checks meetings starting in 60 minutes.
   * Sends WhatsApp reminder with the Google Meet link:
     * *"Hi [Name]! Your Australia 482 Visa consultation with our expert starts in 1 hour at [Local Time]. Join here: [Meet Link]"*

---

### Module 5: Meeting Completion by Abhay & Follow-Up Handover
1. **Consultation Conducted:**
   * Abhay takes the video meeting in the static Google Meet room.
2. **Abhay Marks Complete:**
   * Abhay opens the lead in CRM (`/dashboard/leads/[id]`) and clicks **"Complete Meeting"**.
   * Triggers existing `/api/meetings/complete`:
     * Marks meeting as completed.
     * Lead status transitions to `"follow-up"`.
     * Automatically assigns to the least-loaded staff member with `follow_up` role.

---

### Module 6: Automated 2-Day Re-engagement & Payment Follow-up Cycles
Two distinct background follow-up loops powered by cron:

#### Loop A: Re-engagement Loop (If Candidate clicks "No" at any stage)
* **Rule:** If candidate chooses `[No]` or goes silent at qualification, video prompt, or consultation prompt:
  * **Day 2 (48 hours later):** Reminder #1 $\to$ *"Checking in to see if you had a chance to review the Australia 482 visa details. Would you like to schedule your free weekend consultation?"*
  * **Day 4 (96 hours later):** Reminder #2 $\to$ *"Weekend consultation slots are filling up. Would you like our migration expert to evaluate your CV this weekend?"*
  * **Day 6 (144 hours later):** Reminder #3 (Final) $\to$ *"Final check-in regarding your Australian work visa inquiry with TMS Visa. If you'd like to proceed, tap below. Otherwise, we will close your file."*
  * After 6 days (3 reminders), candidate status is set to `cold` and follow-ups stop to avoid spamming.

#### Loop B: Post-Meeting Payment Follow-up Loop (If Meeting Complete & Unpaid)
* **Rule:** If meeting was marked `complete` by Abhay, but candidate has not paid (`paidAmount <= 0` or status `payment-pending`):
  * Automated WhatsApp reminder sent **every 2 days** with payment instructions, agreement status, and a button to ask questions or request assistance.

---

### Module 7: Context-Aware Trained Meta AI (Virtual Migration Counselor)
If candidate types any free-form question or custom message at any point in the journey:
* **The AI Brain (Persona "Aria" - Senior Migration Specialist):**
  * Trained on full TMS Visa handbook: Subclass 482 eligibility (2 years work experience, IELTS/PTE scores, eligible trades/chefs/IT/healthcare occupations, family work rights, PR 186 pathway).
* **Context Awareness (Knows the Person's Real-Time State):**
  * Queries candidate's live profile from CRM/sessions before answering:
    * *If meeting already booked:* "I see you're already scheduled for this Sunday at 4:30 PM with our senior consultant Abhay! Feel free to ask any questions you'd like him to cover during your session."
    * *If meeting completed & unpaid:* "I see you've already completed your consultation with Abhay! If you have any questions regarding the onboarding agreement or payment steps, I'm here to help."
    * *If email not shared:* Answers their visa query, then prompts for their email.
  * Speaks naturally like a human counselor, professional and encouraging.

---

## 3. Step-by-Step Execution Plan

When you approve this plan, we will execute in this exact sequence:

1. **Step 1: Timezone & Weekend Slot Engine (11am – 7pm IST)**
   * Country dial code mapper (`+234` Nigeria, `+91` India, `+971` UAE, `+44` UK, etc.).
   * Slot generator for 11:00 AM to 07:00 PM IST (30-min intervals).
   * MongoDB `meetingSlots` conflict filter (hides booked slots).
   * Bidirectional timezone translation (Candidate Time $\leftrightarrow$ IST).

2. **Step 2: Context-Aware Meta AI Counselor & TMS 482 Knowledge Base**
   * Migration rulebook, FAQs, and system prompt.
   * Context-injection engine (fetches candidate CRM status, meeting time with Abhay, payment status before replying).
   * AI connector with local graceful fallback.

3. **Step 3: Meta WhatsApp API Client with Timed Delays**
   * Message sender for text, interactive buttons, video, and list messages.
   * 10-second delay orchestrator for video $\to$ process info $\to$ consultation prompt.

4. **Step 4: Conversation State Machine, Slot Locking & Assignment to Abhay**
   * `whatsapp_sessions` MongoDB collection.
   * Auto-creation/update of lead in `leads` collection with `interestedCountry: "Australia"`.
   * Automatic lookup and assignment to username `Abhay`.
   * Static Google Meet link integration.

5. **Step 5: Automated Follow-up Crons (6-Day Re-engagement & Post-Meeting Payment Nudges)**
   * Cron endpoint for 6-day reminder cycle (Day 2, Day 4, Day 6).
   * Cron endpoint for post-meeting unpaid candidate follow-ups every 2 days.
   * Automated 1-hour pre-meeting reminder.

6. **Step 6: Webhook Endpoint & CRM Visual Simulator**
   * Meta Webhook endpoint (`GET` verification challenge, `POST` event handler).
   * In-CRM visual WhatsApp test simulator page (`/dashboard/whatsapp-simulator`) so you can test and inspect the entire flow live.

---

## 4. Confirmation Required Before Code Changes

> [!IMPORTANT]
> **Please review the above plan.**
> If this plan matches everything you want, please reply with your approval (e.g., *"Approved, proceed with execution"*), and I will start implementing Step 1 through Step 6 cleanly without any bugs or errors.
