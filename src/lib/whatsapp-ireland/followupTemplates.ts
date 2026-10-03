export interface FollowUpItem {
  day: number;
  message: string;
  buttons?: Array<{ id: string; title: string }>;
}

export const STEP_FOLLOWUP_MESSAGES: Record<string, FollowUpItem[]> = {
  // Step 1: Welcome & Initial Interest
  STEP_1_WELCOME: [
    {
      day: 1,
      message:
        `Ireland is actively hiring international talent! 🇮🇪 The Ireland Employer Sponsored Work Visa (Critical Skills & General Employment) allows you to live and work in Ireland with your family.\n\n` +
        `• Your Irish employer covers your €1,000 Work Permit fee + €60 Visa fee + flight tickets! ✈️\n` +
        `• FREE English communication coaching & Interview Preparation included with TMS enrollment.\n` +
        `• 100% Money-Back Guarantee if rejected for any reason.\n\n` +
        `Tap below to learn how you can qualify:`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 2,
      message:
        `Did you know? Under the Ireland Employer Sponsored Work Visa, your sponsoring Irish employer covers your €1,000 Work Permit fee + €60 Visa Processing fee + flight tickets! 💼✈️\n\n` +
        `And TMS provides FREE Interview Preparation & English communication coaching from your very first week.\n\n` +
        `Don't miss this opportunity to advance your international career in Europe:`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 3,
      message:
        `Fast-Track Permanent Residency (Stamp 4): Under Ireland's Critical Skills permit, you qualify for full PR after just 2 years of work! 🇪🇺\n\n` +
        `Let us check if your occupation qualifies:`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 4,
      message:
        `Irish companies are looking for skilled professionals across Tech, Healthcare, Engineering, Life Sciences, Construction, and Hospitality. 🇮🇪\n\n` +
        `Are you ready to explore your options with TMS Visa?`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 5,
      message:
        `Family Benefits in Ireland: Your spouse receives immediate full-time work rights, and children access high-quality Irish schools! 👨‍👩‍👧‍👦\n\n` +
        `Take the first step today:`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 6,
      message:
        `Transparent 2-Stage Fee Structure: Only €300 upon agreement signing (covers CV makeover, Case Manager, FREE English coaching & FREE Interview Preparation), and the remaining €700 ONLY after your visa and flight tickets are in hand! ✅\n\n` +
        `100% Money-Back Guarantee — if rejected for any reason, full refund immediately. No questions asked.\n\n` +
        `Tap below to check eligibility:`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 7,
      message:
        `Final Notice: Our current Ireland employer assessment cycle is closing. If you would like to evaluate your eligibility for Ireland, tap below.\n\n` +
        `Otherwise, no further automated messages will be sent!`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
  ],

  // Step 2: Request Email Address
  STEP_2_EMAIL: [
    {
      day: 1,
      message:
        `We are waiting to share all the Ireland visa details with you! 📩\n\n` +
        `Please reply with your email address so our migration team can send you the complete Ireland Work Visa information pack.`,
    },
    {
      day: 2,
      message:
        `Irish employers are actively seeking profiles like yours! 🇮🇪\n\n` +
        `This is a direct employer-sponsored visa. Please reply with your email address to review the eligibility requirements and occupation list.`,
    },
    {
      day: 3,
      message:
        `Employer covers your €1,000 permit and flights — you don't need to pay upfront recruitment fees! 💼\n\n` +
        `Send us your email address to receive the full step-by-step breakdown.`,
    },
    {
      day: 4,
      message:
        `Have questions about Ireland salaries or Stamp 4 PR? 🌍\n\n` +
        `Drop your email address here so we can send you our detailed guide and schedule your free assessment.`,
    },
    {
      day: 5,
      message:
        `Your European career is just one step away! ✈️\n\n` +
        `Reply with your email address to access our complete documentation guide for Ireland.`,
    },
    {
      day: 6,
      message:
        `Quick reminder: Share your email address to receive the Ireland Work Visa guide & Occupation lists (Critical Skills & General Employment) directly in your inbox. 📧`,
    },
    {
      day: 7,
      message:
        `Final reminder to receive the Ireland Work Visa pack. Reply with your email address anytime to restart. 🇮🇪`,
    },
  ],

  // Step 3: Consultation Decision
  STEP_3_CONSULTATION: [
    {
      day: 1,
      message:
        `This is a direct employer-sponsored work visa where approved Irish employers cover work permit and flight charges! 🇮🇪\n\n` +
        `Book a free 1-on-1 consultation with our Ireland expert to learn more about the Ireland Employer Sponsored Work Visa:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 2,
      message:
        `Quick recap from the Ireland video: Your employer covers your €1,000 work permit and flight tickets to Dublin! ✈️\n\n` +
        `Ready to discuss your eligibility with our Ireland expert?`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 3,
      message:
        `Ireland offers both Critical Skills (CSEP) and General Employment Permits (GEP). With a minimum of 2 years' experience, our team checks which pathway best fits your occupation! 🇮🇪\n\n` +
        `Would you like to book a free 1-on-1 consultation slot?`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Not Now" },
      ],
    },
    {
      day: 4,
      message:
        `Our Senior Ireland Migration Expert is holding free virtual sessions this week. Slots are limited! 📅`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "View Available Slots" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 5,
      message:
        `Still thinking about moving to Ireland? 🇪🇺 Fast-track to Stamp 4 PR in 2 years awaits you.\n\n` +
        `Book a quick 1-on-1 session to get all your doubts answered.`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Not Interested" },
      ],
    },
    {
      day: 6,
      message:
        `Don't let another hiring quarter pass! Take 15 minutes this week to speak with our Ireland specialist.`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Schedule Session" },
        { id: "BTN_CONSULT_NO", title: "Not Now" },
      ],
    },
    {
      day: 7,
      message:
        `This is our final check-in regarding your Ireland consultation. Tap below if you'd like to book, or message us anytime you're ready! 🇮🇪`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Close File" },
      ],
    },
  ],

  // Step 4 Date: Select Consultation Date
  STEP_4_DATE: [
    {
      day: 1,
      message:
        `You're one step closer to booking a meeting with us! 📅\n\n` +
        `Please select your preferred date to speak with our Ireland visa specialist:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 2,
      message:
        `Talk 1-on-1 with our live Ireland visa counselor! 🤝\n\n` +
        `Pick a weekday date to discuss the Ireland Employer Sponsored Work Visa:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 3,
      message:
        `Know more about the Ireland Employer Sponsored Work Visa: Tap below to pick an upcoming weekday date that fits your schedule! 🇮🇪`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 4,
      message:
        `Consultation slots are filling fast for this week! Choose your date now so our senior advisor can evaluate your file:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 5,
      message:
        `Reserve your 1-on-1 session to verify your qualifications and employer sponsorship eligibility in Ireland. Pick a date below:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 6,
      message:
        `Don't let your Irish employer sponsorship opportunity slip. Select your consultation date today to lock in your session:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 7,
      message:
        `Final Reminder: Choose your consultation date today to connect 1-on-1 with our Ireland migration team. 🇮🇪`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
  ],

  // Step 4 Slot: Select Time Slot
  STEP_4_SLOT: [
    {
      day: 1,
      message:
        `You selected your consultation date! ⏰\n\n` +
        `Please pick your convenient time slot to lock in your meeting:`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
    {
      day: 2,
      message:
        `Available time slots are closing! Tap below to choose your 1-hour consultation time and receive your Google Meet invitation link:`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
    {
      day: 3,
      message:
        `Complete your booking in 10 seconds: Select a time slot to confirm your 1-on-1 Ireland Employer Sponsored Work Visa consultation! 📅`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
    {
      day: 4,
      message:
        `Our visa advisors are organizing consultations for your selected date. Please choose your preferred time slot below:`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
    {
      day: 5,
      message:
        `Quick reminder: Approved Irish employers are looking for eligible applicants. Pick an available time slot to finalize your consultation:`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
    {
      day: 6,
      message:
        `Limited time slots remaining! Please select your 1-hour consultation slot before the schedule is finalized.`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
    {
      day: 7,
      message:
        `Final Reminder: Pick your consultation time slot now, or reply with another date that works better for you. ⏰`,
      buttons: [{ id: "BTN_SELECT_SLOT", title: "Select Time Slot" }],
    },
  ],

  // Step 5: Awaiting CV / Resume
  STEP_5_CV: [
    {
      day: 1,
      message:
        `Hi! 📄 Please send your updated CV / Resume here on WhatsApp in PDF or Word format.\n\n` +
        `Our recruitment team is ready to review your qualifications against Ireland's Critical Skills (CSEP) & General Employment (GEP) lists (minimum 2 years of experience required)! 🇮🇪`,
    },
    {
      day: 2,
      message:
        `Quick reminder: Uploading your CV allows our team to match you directly with sponsoring Irish employers. Send it as an attachment here! 📎`,
    },
    {
      day: 3,
      message:
        `We're reviewing candidate profiles for this month's Irish employer submissions. Please share your CV here so you don't miss out! 📄`,
    },
    {
      day: 4,
      message:
        `Need help formatting your CV? Don't worry — send your current CV as-is, and our team will provide a European/Irish-standard makeover! ✍️`,
    },
    {
      day: 5,
      message:
        `Irish employers evaluate candidates based on structured European CV standards. Send us your resume so we can begin your assessment. 📄`,
    },
    {
      day: 6,
      message:
        `Friendly check-in: We haven't received your CV yet. Tap the attachment icon 📎 on WhatsApp and send your PDF or Word document!`,
    },
    {
      day: 7,
      message:
        `Final reminder for CV submission for Ireland. You can send your resume here anytime you're ready to proceed! 🇮🇪`,
    },
  ],

  // Step 7: Cancelled Meeting Rescheduling
  STEP_7_RESCHEDULE: [
    {
      day: 1,
      message:
        `Unfortunately your consultation meeting could not take place today.\n\n` +
        `Please reschedule your consultation with our Ireland expert by choosing a date below:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 2,
      message:
        `We missed you! 🤝 Please reschedule your free 1-on-1 consultation so our team can evaluate your Ireland Employer Sponsored Work Visa profile:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 3,
      message:
        `Don't lose your spot: Irish employers are actively hiring under Critical Skills & General Employment permits. Tap below to pick a new consultation date on an upcoming weekday! 🇮🇪`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 4,
      message:
        `Weekday slots are open: Reschedule your 1-on-1 meeting (Monday to Friday) to reconnect with our Ireland advisor:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 5,
      message:
        `Free eligibility review: Reschedule your meeting today to find out which Irish employers can sponsor your visa and cover your permit! ✈️`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 6,
      message:
        `Consultation openings are limited this week. Tap below to choose your new date and time for a 1-on-1 video call:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 7,
      message:
        `Final Rescheduling Reminder: Tap below to reschedule your consultation with our Ireland migration team whenever you are ready. 🇮🇪`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
  ],
};

// Aliases for compatibility
(STEP_FOLLOWUP_MESSAGES as any).STEP_3_VIDEO = STEP_FOLLOWUP_MESSAGES.STEP_3_CONSULTATION;
(STEP_FOLLOWUP_MESSAGES as any).STEP_6_CV = STEP_FOLLOWUP_MESSAGES.STEP_5_CV;
