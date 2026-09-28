# TMS Visa CRM — Complete WhatsApp Workflow Matrix
### Verified 100% Exact Messages, Decision Logic (YES / NO / NO CLICK), and 7-Day Follow-Up Campaigns

This document contains the **literal, exact code-level messages** sent to candidates across all stages of the WhatsApp automation funnel, verified directly against the production codebase:
- [`src/lib/whatsapp/followupTemplates.ts`](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/followupTemplates.ts)
- [`src/lib/whatsapp/stateMachine.ts`](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/stateMachine.ts)
- [`src/lib/whatsapp/followupEngine.ts`](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/followupEngine.ts)
- [`src/lib/whatsapp/meetingNotifications.ts`](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/meetingNotifications.ts)
- [`src/lib/whatsapp/media.ts`](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/media.ts)
- [`src/lib/whatsapp/slots.ts`](file:///c:/Users/HP/Desktop/crm-main/src/lib/whatsapp/slots.ts)

---

## Executive Summary Matrix

| Funnel Stage | Step Key | When Initial is Sent | Affirmative Branch (YES) | Negative Branch (NO) | Inactivity (NO CLICK) 7-Day Schedule |
|---|---|---|---|---|---|
| **1. Welcome & Initial Interest** | `STEP_1_WELCOME` | **Immediately** upon first inbound message from Ad or greeting | Advances to **Step 2** (`AWAITING_EMAIL`), requests email | Sends re-engagement message + starts 7-day `STEP_1_WELCOME` cycle | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |
| **2. Email Intake & Information** | `STEP_2_EMAIL` | **Immediately** upon Step 1 YES | Validates email, creates CRM lead, dispatches info pack via SMTP, sends video | Prompts email retry | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |
| **3. Consultation Decision** | `STEP_3_CONSULTATION` | Exactly **10 minutes** after email registration | Advances to **Step 4** (`SELECTING_DAY`), displays 10 weekend dates | Sends re-engagement message + starts 7-day `STEP_3_CONSULTATION` cycle | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |
| **4. Date Selection** | `STEP_4_DATE` | **Immediately** when candidate clicks `[Book Consultation]` | Advances to **Step 5** (`SELECTING_SLOT`), displays 8 1-hour time slots | Returns to date picker | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |
| **5. Slot Selection** | `STEP_4_SLOT` | **Immediately** upon selecting date | Locks slot, updates CRM to `meeting-scheduled`, assigns to Abhay, generates Google Meet, sends **Step 6** confirmation | If slot collision, suggests remaining slots | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |
| **6. Confirmed & Pre-Meeting** | `BOOKED` | **Immediately** on slot booking + **0–65 mins** before call | Candidate joins Google Meet call on time | Can tap `[Change Date & Time]` or type cancel | Sends **1-Hour Pre-Meeting Reminder** on consultation day |
| **7. Post-Meeting CV Intake** | `STEP_6_CV` | **Immediately** when consultant marks meeting Complete in CRM | Saves CV to GridFS, updates `cvReceivedAt`, notifies Case Manager | Guard blocks re-booking; answers status questions | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |
| **8. Cancelled Meeting Rescheduling** | `STEP_7_RESCHEDULE` | **Immediately** when meeting is cancelled in CRM or by candidate | Re-opens Step 4 weekend date picker list | Remains in `AWAITING_REENGAGEMENT` | Day 1 to Day 7 distinct follow-ups at **10:00 AM candidate local time** |

---

## Step 1: Welcome & Initial Interest (`WELCOME`)

### 1.1 Initial Outbound Message
* **When Sent:** Immediately upon candidate's first inbound message from an Ad or greeting (*"Hi"*, *"Hello"*).
* **Interactive Buttons:** `[Yes, Interested]` `[Not Right Now]`
```text
Hello ☺️! Welcome to The Migration School (TMS Visa) 🇦🇺.

We specialize in employer-sponsored work visas for Australia.

*We have received your enquiry for Australia Employer Sponsored Work Visa, to know all the details ,choose  Insterested*
```

---

### 1.2 Condition: If Candidate Clicks "YES, INTERESTED" (YES)
* **When Sent:** Immediately upon clicking `[Yes, Interested]` or typing affirmative (*"yes"*, *"interested"*, *"sure"*).
* **State Transition:** `WELCOME` → `AWAITING_EMAIL`.
```text
Great! Now we will  Share All The Details over your email , *please reply with your Email Address:*
```

---

### 1.3 Condition: If Candidate Clicks "NOT RIGHT NOW" (NO)
* **When Sent:** Immediately upon clicking `[Not Right Now]` or typing negative (*"no"*, *"not now"*, *"later"*).
* **State Transition:** Stays in `WELCOME`. Next reminder scheduled for tomorrow at 10:00 AM candidate local time.
* **Interactive Buttons:** `[Yes, Interested]` `[Maybe Later]`
```text
No problem at all! 😊 Take your time.

Whenever you are ready, we are here to help you explore the Australia Employer Sponsored Work Visa! 🇦🇺 Remember — it is a fully employer-sponsored work visa where Australian employers pay for your sponsorship.

Tap below if you change your mind:
```

---

### 1.4 Condition: If Candidate DOES NOT CLICK / INACTIVE (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time** if no button was clicked.

#### Day 1 (10:00 AM)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Australia is actively hiring! 🇦🇺 The Australia Employer Sponsored Work Visa is a direct, fully employer-sponsored work visa allowing you to live and work in Australia with your family.

Tap below to learn how you can qualify:
```

#### Day 2 (10:00 AM)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Did you know? Under the Australia Employer Sponsored Work Visa, your sponsoring Australian employer covers your nomination and legal fees! 💼

Don't miss this opportunity to advance your international career. Tap below:
```

#### Day 3 (10:00 AM)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Employer-Covered Relocation: Sponsoring Australian employers often provide flight tickets, relocation support, and accommodation assistance! ✈️

Let us check if your occupation qualifies:
```

#### Day 4 (10:00 AM)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Australian employers urgently need skilled workers across healthcare, trades, engineering, IT, hospitality, and management. They offer fully employer sponsored work visas! 🇦🇺

Are you ready to explore your options?
```

#### Day 5 (10:00 AM)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Direct Pathway to Permanent Residency (PR): Working on an Australia Employer Sponsored Work Visa provides a clear transitional pathway to Australian permanent residency! 🌏

Take the first step today:
```

#### Day 6 (10:00 AM)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Zero Recruitment Agency Fees: Australian employers cover the sponsorship charges. Our team helps connect you directly with approved sponsor opportunities.

Tap below to explore:
```

#### Day 7 (10:00 AM - Final Opportunity)
*Buttons:* `[Yes, Interested]` `[Not Right Now]`
```text
Final Opportunity: Our Australian employer sponsorship assessment round is closing soon. If you wish to assess your eligibility for the Australia Employer Sponsored Work Visa, tap below.

Otherwise, no further messages will be sent!
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`. No further automated messages are dispatched.

---

## Step 2: Email Intake & Information Delivery (`AWAITING_EMAIL`)

### 2.1 Initial Outbound Message
* **When Sent:** Immediately upon clicking *"Yes, Interested"*.
```text
Great! Now we will  Share All The Details over your email , *please reply with your Email Address:*
```

---

### 2.2 Condition: If Candidate Shares Valid Email (YES)
* **When Sent:** Immediately upon receiving valid email format.
* **State Transition:** `AWAITING_EMAIL` → `AWAITING_CONSULTATION_DECISION`.
* **Actions:**
  1. Creates or updates lead in CRM `leads` collection.
  2. Dispatches Information Pack Email with 691 Eligible Occupation List & PTE Guide PDF from `info@tmsvisa.com`.
  3. Sends instant WhatsApp confirmation message:
     ```text
     We have sent an email about the whole process to your email address (**{{CandidateEmail}}**)! Please check your inbox (and spam/junk folder) as well. 📩
     ```
  4. Waits 2 seconds → Sends Explainer Video link:
     ```text
     🎥 *Australia Work Visa — Process Guide Video* 🇦🇺

     Here is our video explaining employer sponsorship requirements, eligible occupations, and relocation pathways:

     ▶️ *Watch the Video Here:*
     {{VideoUrl}}

     *(Tap the link above to watch the video anytime)*
     ```
  5. Schedules 10-minute Consultation prompt.

---

### 2.3 Condition: If Candidate Shares Invalid Email (RETRY)
* **When Sent:** Immediately upon invalid format or non-existent domain.
```text
⚠️ Please enter a valid email address (e.g. yourname@gmail.com or yourname@yahoo.com) so we can send you the official visa details.
```

---

### 2.4 Condition: If Candidate DOES NOT REPLY WITH EMAIL (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time**.

#### Day 1 (10:00 AM)
```text
We are waiting to share all the visa details with you! 📩

Please reply with your email address so our migration team can send you the complete Australia Employer Sponsored Work Visa information pack.
```

#### Day 2 (10:00 AM)
```text
Australian employers are waiting for profiles like yours! 🇦🇺

This is a fully employer-sponsored work visa. Please reply with your email address to review the eligibility requirements.
```

#### Day 3 (10:00 AM)
```text
Employer covers your sponsorship charges — you don't need to pay upfront recruitment fees! 💼

Send us your email address to receive the full step-by-step visa breakdown.
```

#### Day 4 (10:00 AM)
```text
It only takes 5 seconds: Simply drop your email address below (e.g. yourname@gmail.com) so we can send the official Australian work visa guide to your inbox. 📩
```

#### Day 5 (10:00 AM)
```text
Australian sponsor employers have priority openings this quarter. Please provide your email address right here so our evaluation desk can forward the occupation list to you!
```

#### Day 6 (10:00 AM)
```text
Candidate shortlisting is in progress for Australian employers. Please reply with your email address so your profile can be considered for direct sponsorship. 🇦🇺
```

#### Day 7 (10:00 AM - Final Reminder)
```text
Final Reminder: Share your email address today to receive the Australia Employer Sponsored Work Visa information pack. This is our last reminder! 📩
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`.

---

## Step 3: Consultation Booking Prompt (`AWAITING_CONSULTATION_DECISION`)

### 3.1 Initial Outbound Message
* **When Sent:** Exactly **10 minutes** after candidate shares their email address (allows time to watch the video).
* **Interactive Buttons:** `[Book Consultation]` `[Maybe Later]`
```text
*Ready to take the next step towards Australia? 🇦🇺*

Book a 1-on-1 consultation meeting with our Australian Visa Expert to check your job eligibility and visa pathway.
```

---

### 3.2 Condition: If Candidate Clicks "BOOK CONSULTATION" (YES)
* **When Sent:** Immediately upon clicking `[Book Consultation]` or typing affirmative (*"book"*, *"consultation"*, *"meeting"*).
* **State Transition:** `AWAITING_CONSULTATION_DECISION` → `SELECTING_DAY`.
* **Interactive List:** 10 upcoming weekend dates across the month.
```text
Our 1-on-1 consultations with our senior visa experts are held on **Saturdays and Sundays**.

All slots run strictly between 01:00 PM and 09:00 PM IST in 1-hour intervals [or converted to {{CandidateTimeZone}}].

Here are the 10 upcoming weekend dates across the month. Please select your preferred date:
```

---

### 3.3 Condition: If Candidate Clicks "MAYBE LATER" (NO)
* **When Sent:** Immediately upon clicking `[Maybe Later]` or typing negative.
* **State Transition:** Stays in `AWAITING_CONSULTATION_DECISION`. Follow-up cycle scheduled for tomorrow 10:00 AM.
* **Interactive Buttons:** `[Book Consultation]`
```text
No problem at all! 😊 Take your time.

Whenever you are ready, we are here to help you explore the Australia Employer Sponsored Work Visa — this is a fully employer-sponsored visa where the Australian employer covers your sponsorship charges! 🇦🇺

Tap below when you are ready to book your free consultation:
```

---

### 3.4 Condition: If Candidate DOES NOT CLICK / INACTIVE (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time**.

#### Day 1 (10:00 AM)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
This is a fully employer-sponsored work visa where the Australian employer pays major charges! 🇦🇺

Book a free 1-on-1 meeting with us to know more about the Australia Employer Sponsored Work Visa:
```

#### Day 2 (10:00 AM)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
You don't need to pay anything upfront for employer nomination — Australian employers cover the sponsorship! 💼

Book your free 1-on-1 consultation to speak with our migration expert:
```

#### Day 3 (10:00 AM)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
Australian employers pay the amount for your sponsorship. Book a free 1-on-1 video meeting with our senior advisor this weekend to verify your job eligibility! ✈️
```

#### Day 4 (10:00 AM)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
Weekend Consultations Open: Our senior Australian visa consultants have limited free 1-on-1 video slots this Saturday and Sunday. Tap below to reserve your free call:
```

#### Day 5 (10:00 AM)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
Verify your occupation and discover how Australian employers sponsor overseas skilled candidates on the Australia Employer Sponsored Work Visa. Book your free consultation today! 🇦🇺
```

#### Day 6 (10:00 AM)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
Direct employer sponsorship opportunities are limited this month. Don't miss out on having your career history evaluated by our team. Tap below to book your free call!
```

#### Day 7 (10:00 AM - Final Reminder)
*Buttons:* `[Book Consultation]` `[Maybe Later]`
```text
Last Reminder: Book your free 1-on-1 Australian visa strategy session before weekend slots close. Tap below to schedule, or reply whenever you are ready!
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`.

---

## Step 4: Consultation Date Selection (`SELECTING_DAY`)

### 4.1 Initial Outbound Message
* **When Sent:** Immediately when candidate requests consultation booking.
* **Interactive List:** 10 upcoming weekend dates (Saturdays and Sundays).
```text
Our 1-on-1 consultations with our senior visa experts are held on **Saturdays and Sundays**.

All slots run strictly between 01:00 PM and 09:00 PM IST in 1-hour intervals [or converted to {{CandidateTimeZone}}].

Here are the 10 upcoming weekend dates across the month. Please select your preferred date:
```

---

### 4.2 Condition: If Candidate Selects a Date (YES)
* **When Sent:** Immediately upon tapping a date from the interactive list.
* **State Transition:** `SELECTING_DAY` → `SELECTING_SLOT`.
* **Output Format:**
```text
📅 *All Available Consultation Slots for {{DayLabel}}*
(1-hour 1-on-1 sessions between {{FirstSlotStart}} - {{LastSlotEnd}} {{TimezoneShort}})

*1.* {{Slot1}}
*2.* {{Slot2}}
*3.* {{Slot3}}
...
*8.* {{Slot8}}

👉 Tap *Select Slot* below or reply with your slot number (*1* to *{{Count}}*).
🔄 Want a different date? Tap *Change Date*.
```

---

### 4.3 Condition: If Selected Date is FULL (Alternative Suggestion)
* **When Sent:** If all 8 slots on selected date are already reserved.
```text
All consultation slots for **{{SelectedDate}}** are currently fully booked! 🔒

Here are all available consultation slots for the next weekend on **{{NextDate}}**:

{{AvailableSlotsList}}
```

---

### 4.4 Condition: If Candidate DOES NOT SELECT A DATE (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time**.

#### Day 1 (10:00 AM)
*Buttons:* `[Select Date]`
```text
You're one step closer to booking a meeting with us! 📅

Please select your preferred date to speak with our Australian visa specialist:
```

#### Day 2 (10:00 AM)
*Buttons:* `[Select Date]`
```text
Talk 1-on-1 with our live Australian visa agent! 🤝

Pick a date on the calendar to discuss the Australia Employer Sponsored Work Visa:
```

#### Day 3 (10:00 AM)
*Buttons:* `[Select Date]`
```text
Know more about the Australia Employer Sponsored Work Visa: Tap below to pick an upcoming Saturday or Sunday that fits your schedule! 🇦🇺
```

#### Day 4 (10:00 AM)
*Buttons:* `[Select Date]`
```text
Consultation slots are filling fast for this weekend! Choose your date now so our senior advisor can evaluate your file:
```

#### Day 5 (10:00 AM)
*Buttons:* `[Select Date]`
```text
Reserve 15 minutes to verify your qualifications and job category with our visa desk. Pick a date below:
```

#### Day 6 (10:00 AM)
*Buttons:* `[Select Date]`
```text
Don't let your Australian employer sponsorship opportunity slip. Select your consultation date today to lock in your session:
```

#### Day 7 (10:00 AM - Final Reminder)
*Buttons:* `[Select Date]`
```text
Final Reminder: Choose your consultation date today to connect 1-on-1 with our Australian migration team. 🇦🇺
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`.

---

## Step 5: Time Slot Selection (`SELECTING_SLOT`)

### 5.1 Initial Outbound Message
* **When Sent:** Immediately upon selecting a date (displays 8 1-hour slots).

---

### 5.2 Condition: If Candidate Selects Slot (YES)
* **When Sent:** Immediately upon clicking slot or replying with slot number.
* **State Transition:** `SELECTING_SLOT` → `BOOKED`.
* **Actions:**
  1. Atomically reserves slot in `meetingSlots` collection.
  2. Updates CRM lead status to `meeting-scheduled`.
  3. Assigns lead to consultant Abhay in CRM.
  4. Generates Google Meet link (`https://meet.google.com/hgu-yxat-nwy`).
  5. Sends immediate confirmation message:
     ```text
     Dear {{CandidateName}},

     Thank you for showing your interest in the *Australia Employer Sponsored Work Visa*.

     We are pleased to invite you to a *Google Meet session* to discuss the visa process, eligibility, requirements, and further details.

     📅 *Date:* {{MeetingDate}}
     ⏰ *Time:* {{MeetingTime}}
     💻 *Google Meet:* https://meet.google.com/hgu-yxat-nwy

     Please make sure to *join the meeting on time*.

     We look forward to speaking with you.

     *Best regards,*
     *TMS Visa*
     ```
  6. Sends quick reply button 300ms later:
     ```text
     ℹ️ *Need to change your date or time?*
     If you mistakenly selected the wrong slot or need to change it later, tap below anytime:
     ```
     *Buttons:* `[Change Date & Time]`

---

### 5.3 Condition: If Slot was Just Reserved by Another Candidate (COLLISION)
* **When Sent:** Immediately if another candidate locked the slot milliseconds earlier.
```text
⚠️ That slot (**{{BookedSlotLabel}}**) was just booked by another candidate!

All consultation slots are locked once reserved to avoid overlap. Please choose another available time:

{{RemainingSlotsList}}
```

---

### 5.4 Condition: If Candidate DOES NOT SELECT A TIME SLOT (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time**.

#### Day 1 (10:00 AM)
*Buttons:* `[Select Time Slot]`
```text
You selected your consultation date! ⏰

Please pick your convenient time slot (between 01:00 PM and 09:00 PM IST) to lock in your meeting:
```

#### Day 2 (10:00 AM)
*Buttons:* `[Select Time Slot]`
```text
Available time slots are closing! Tap below to choose your 1-hour consultation time and receive your Google Meet invitation link:
```

#### Day 3 (10:00 AM)
*Buttons:* `[Select Time Slot]`
```text
Complete your booking in 10 seconds: Select a time slot to confirm your 1-on-1 Australia Employer Sponsored Work Visa consultation! 📅
```

#### Day 4 (10:00 AM)
*Buttons:* `[Select Time Slot]`
```text
Our visa advisors are organizing consultations for your selected date. Please choose your preferred time slot below:
```

#### Day 5 (10:00 AM)
*Buttons:* `[Select Time Slot]`
```text
Quick reminder: Sponsoring employers are looking for eligible applicants. Pick an available time slot to finalize your consultation:
```

#### Day 6 (10:00 AM)
*Buttons:* `[Select Time Slot]`
```text
Limited time slots remaining! Please select your 1-hour consultation slot before the schedule is finalized.
```

#### Day 7 (10:00 AM - Final Reminder)
*Buttons:* `[Select Time Slot]`
```text
Final Reminder: Pick your consultation time slot now, or reply with another date that works better for you. ⏰
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`.

---

## Step 6: Confirmed Consultation & Pre-Meeting (`BOOKED`)

### 6.1 1-Hour Pre-Meeting Reminder
* **When Sent:** Automatically sent **0 to 65 minutes before scheduled meeting start time** on consultation day.
```text
⏰ *Reminder: Your Australian Visa Consultation is in 1 Hour!*

📅 *Date:* {{MeetingDate}}
⏰ *Time:* {{CandidateLocalTime}} ({{CandidateTimeZone}})
🇮🇳 *India Time:* {{ISTStartTime}} IST

🔗 *Google Meet Link:*
https://meet.google.com/hgu-yxat-nwy

Our Australian visa specialist is ready to evaluate your Australia Employer Sponsored Work Visa file. Please tap the link to join on time! 🇦🇺
```

---

### 6.2 Condition: If Candidate Reschedules Before Call
* **When Sent:** Immediately upon choosing a new slot.
* **Actions:** Releases old slot; locks new slot in `meetingSlots`.
```text
Dear {{CandidateName}},

Your *Australia Employer Sponsored Work Visa* consultation has been **successfully rescheduled**! ✅

📅 *New Date:* {{NewMeetingDate}}
⏰ *New Time:* {{NewMeetingTime}}
💻 *Google Meet:* https://meet.google.com/hgu-yxat-nwy

Please make sure to *join the meeting on time*.

*Best regards,*
*TMS Visa*
```

---

### 6.3 Condition: If Candidate Requests Meeting Link via Chat
* **When Sent:** Immediately when candidate asks *"meeting link"*, *"how to join"*, etc.
```text
Hi {{CandidateName}}! 👋

Your 1-on-1 consultation with our senior visa expert is confirmed for **{{MeetingDate}}** at **{{MeetingTime}}**.

🔗 **Google Meet Room Link:*
https://meet.google.com/hgu-yxat-nwy

*(Tap the link above at your scheduled time to join the call. Please have your CV ready!)* 🇦🇺
```

---

## Step 7: Post-Meeting & CV Intake (`MEETING_COMPLETED` / `AWAITING_CV`)

### 7.1 Initial Outbound Message
* **When Sent:** Immediately when consultant marks meeting as **Completed** in CRM.
* **State Transition:** `BOOKED` → `AWAITING_CV`.
```text
Thanks for attending the meeting. We hope that you enjoyed the meeting with our expert. Now, our review team will review your CV to match the requirements of Australian Employers! 🇦🇺

Please send your CV / Resume here in PDF or Word document format. 📄
```

---

### 7.2 Condition: When Candidate Uploads CV (YES)
* **When Sent:** Immediately upon candidate sending a PDF or Word document.
* **Actions:**
  1. Stores document in GridFS file storage (`chatFiles` bucket).
  2. Updates session with `cvReceivedAt` timestamp and filename.
  3. Advances session to `MEETING_COMPLETED`.
  4. Sends literal automated reply:
```text
Thanks for sharing your CV with us! Our review team is reviewing your qualification and work experience according to Employers Requirement.

Once successfully reviewed , our Australian team will call you from an Australian number. 🇦🇺📞
```

---

### 7.3 Condition: If Candidate Asks About CV Review Status
* **When Sent:** Candidate asks *"did you check my cv"*, *"cv status"*, etc.
```text
Thank you for checking in! Please be patient while our review team is still assessing your qualifications and job experience based on Employers requirements.

Once the review is completed, please expect a call from an Australian number.. 🇦🇺📞
```

---

### 7.4 Condition: If Candidate Tries to Re-Book Consultation (GUARD)
* **When Sent:** Candidate attempts to book another meeting after one is already marked completed.
```text
Hello {{CandidateName}}! 👋

Your 1-on-1 consultation session with our senior visa expert has already been completed! ✅

Your profile is now in the onboarding and documentation phase. Our team is preparing your official evaluation and agreement.

If you have any questions about your Australia Employer Sponsored Work Visa file or payment, feel free to reply right here! 🇦🇺
```

---

### 7.5 Condition: If Candidate DOES NOT UPLOAD CV (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time**.

#### Day 1 (10:00 AM)
```text
Please share your CV / Resume with us! 📄

Our compliance and employer matching team is waiting to verify your Australia Employer Sponsored Work Visa eligibility.
```

#### Day 2 (10:00 AM)
```text
This visa is fully sponsored by your employer, so please share your CV to move forward! 🇦🇺

Send it in PDF or Word document format right here.
```

#### Day 3 (10:00 AM)
```text
Our Australian employer matching team is waiting for your CV. Upload your resume here on WhatsApp so we can prepare your file! 📄
```

#### Day 4 (10:00 AM)
```text
We need your updated CV to match your experience with active Australian sponsoring companies. Please attach it here.
```

#### Day 5 (10:00 AM)
```text
Fast-track your employer sponsorship application: Simply send your CV here in PDF or Word format so our evaluators can review. 💼
```

#### Day 6 (10:00 AM)
```text
Don't delay your Australia Employer Sponsored Work Visa file! Send your CV today so our senior review team can assess your job eligibility. 🇦🇺
```

#### Day 7 (10:00 AM - Final Reminder)
```text
Final Reminder: Please share your CV with us today to proceed with your Australia Employer Sponsored Work Visa application. 📄
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`.

---

## Step 8: Cancelled Consultation & Rescheduling (`RESCHEDULING_DATE` / `STEP_7_RESCHEDULE`)

### 8.1 Initial Outbound Message (Meeting Cancelled in CRM)
* **When Sent:** Immediately when consultant marks meeting as **Cancelled** in CRM.
* **Interactive List:** 10 upcoming weekend dates.
```text
Unfortunately your consultation meeting could not take place with us today.

Please reschedule your meeting with us by choosing an available date below:
```

### 8.2 Initial Outbound Message (Candidate Self-Cancellation)
* **When Sent:** Immediately when candidate types *"cancel meeting"* or *"cancel slot"*.
* **Buttons:** `[Reschedule Meeting]`
```text
Hello {{CandidateName}}! 👋

Your consultation meeting has been cancelled. ℹ️

Please reschedule your 1-on-1 session for an upcoming weekend so our expert can assess your Australia Employer Sponsored Work Visa file.

👉 Tap below to choose an available time slot:
```

---

### 8.3 Condition: If Candidate Clicks "RESCHEDULE MEETING" (YES)
* **Action:** Re-opens Step 4 weekend date picker list.

---

### 8.4 Condition: If Candidate DOES NOT RESCHEDULE (7-Day Follow-Up Cycle)
* **When Sent:** Sent daily at **10:00 AM candidate local time**.

#### Day 1 (10:00 AM)
*Buttons:* `[Reschedule Meeting]`
```text
Unfortunately your consultation meeting could not take place with us today.

Please reschedule your meeting with us by choosing a date below:
```

#### Day 2 (10:00 AM)
*Buttons:* `[Reschedule Meeting]`
```text
We missed you! 🤝 Please reschedule your free 1-on-1 consultation so our team can evaluate your Australia Employer Sponsored Work Visa file:
```

#### Day 3 (10:00 AM)
*Buttons:* `[Reschedule Meeting]`
```text
Don't lose your spot: Australian employers are actively hiring. Tap below to pick a new consultation date on an upcoming weekend! 🇦🇺
```

#### Day 4 (10:00 AM)
*Buttons:* `[Reschedule Meeting]`
```text
Weekend slots are open: Reschedule your 1-on-1 meeting (Saturdays & Sundays, 01:00 PM – 09:00 PM IST) to reconnect with our advisor:
```

#### Day 5 (10:00 AM)
*Buttons:* `[Reschedule Meeting]`
```text
Free eligibility review: Reschedule your meeting today to find out which Australian employers can sponsor your visa! ✈️
```

#### Day 6 (10:00 AM)
*Buttons:* `[Reschedule Meeting]`
```text
Consultation openings are limited this weekend. Tap below to choose your new date and time for a 1-on-1 video call:
```

#### Day 7 (10:00 AM - Final Rescheduling Reminder)
*Buttons:* `[Reschedule Meeting]`
```text
Final Rescheduling Reminder: Tap below to reschedule your consultation with our Australian migration team whenever you are ready. 🇦🇺
```
* **Post Day 7:** Candidate session status is permanently set to `COLD`. No further messages are sent.
