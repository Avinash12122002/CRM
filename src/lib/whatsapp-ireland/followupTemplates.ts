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
        `• Direct employer sponsorship with vetted Irish employers 💼\n` +
        `• FREE English communication coaching & Interview Preparation included with TMS enrollment.\n` +
        `• 100% full legal compliance and dedicated visa roadmap.\n\n` +
        `Tap below to learn how you can qualify:`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Yes, Interested" },
        { id: "BTN_IRELAND_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 2,
      message:
        `Did you know? Under the Ireland Employer Sponsored Work Visa, your sponsoring Irish employer covers your official work permit processing and flight tickets! 💼✈️\n\n` +
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
        `TMS Visa provides complete end-to-end guidance: employer outreach, CV makeover, dedicated Case Manager, and comprehensive Interview Preparation! 🇮🇪\n\n` +
        `Get evaluated by our senior specialists before upcoming employer sponsorship quotas fill up.\n\n` +
        `Tap below to check your eligibility:`,
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
        `We are waiting to share all the visa details with you! 📩\n\n` +
        `Please reply with your email address so our migration team can send you the complete Ireland Employer Sponsored Work Visa information pack.`,
    },
    {
      day: 2,
      message:
        `Irish employers are waiting for profiles like yours! 🇮🇪\n\n` +
        `This is a fully employer-sponsored work visa. Please reply with your email address to review the eligibility requirements.`,
    },
    {
      day: 3,
      message:
        `Employer covers your sponsorship charges — you don't need to pay upfront recruitment fees! 💼\n\n` +
        `Send us your email address to receive the full step-by-step visa breakdown.`,
    },
    {
      day: 4,
      message:
        `It only takes 5 seconds: Simply drop your email address below (e.g. yourname@gmail.com) so we can send the official Ireland work visa guide to your inbox. 📩`,
    },
    {
      day: 5,
      message:
        `Irish sponsor employers have priority openings this quarter. Please provide your email address right here so our evaluation desk can forward the occupation list to you!`,
    },
    {
      day: 6,
      message:
        `Candidate shortlisting is in progress for Irish employers. Please reply with your email address so your profile can be considered for direct sponsorship. 🇮🇪`,
    },
    {
      day: 7,
      message:
        `Final Reminder: Share your email address today to receive the Ireland Employer Sponsored Work Visa information pack. This is our last reminder! 📩`,
    },
  ],

  // Step 3: Book Consultation Meeting
  STEP_3_CONSULTATION: [
    {
      day: 1,
      message:
        `This is a fully employer-sponsored work visa where the Irish employer pays major charges! 🇮🇪\n\n` +
        `Book a free 1-on-1 meeting with us to know more about the Ireland Employer Sponsored Work Visa:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 2,
      message:
        `You don't need to pay anything upfront for employer nomination — Irish employers cover the sponsorship! 💼\n\n` +
        `Book your free 1-on-1 consultation to speak with our migration expert:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 3,
      message:
        `Irish employers pay the amount for your sponsorship. Book a free 1-on-1 video meeting with our senior advisor this week to verify your job eligibility! ✈️`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 4,
      message:
        `Weekday Consultations Open: Our senior Ireland visa consultants have limited free 1-on-1 video slots Monday to Friday. Tap below to reserve your free call:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 5,
      message:
        `Verify your occupation and discover how Irish employers sponsor overseas skilled candidates on the Ireland Employer Sponsored Work Visa. Book your free consultation today! 🇮🇪`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 6,
      message:
        `Direct employer sponsorship opportunities are limited this month. Don't miss out on having your career history evaluated by our team. Tap below to book your free call!`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 7,
      message:
        `Last Reminder: Book your free 1-on-1 Ireland visa strategy session before weekday slots close. Tap below to schedule, or reply whenever you are ready!`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
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

  // Step 5 / Step 6: Post-Meeting CV Intake
  STEP_5_CV: [
    {
      day: 1,
      message:
        `Please share your CV / Resume with us! 📄\n\n` +
        `Our compliance and employer matching team is waiting to verify your Ireland Employer Sponsored Work Visa eligibility.`,
    },
    {
      day: 2,
      message:
        `This visa is fully sponsored by your employer, so please share your CV to move forward! 🇮🇪\n\n` +
        `Send it in PDF or Word document format right here.`,
    },
    {
      day: 3,
      message:
        `Our Irish employer matching team is waiting for your CV. Upload your resume here on WhatsApp so we can prepare your file! 📄`,
    },
    {
      day: 4,
      message:
        `We need your updated CV to match your experience with active Irish sponsoring companies. Please attach it here.`,
    },
    {
      day: 5,
      message:
        `Fast-track your employer sponsorship application: Simply send your CV here in PDF or Word format so our evaluators can review. 💼`,
    },
    {
      day: 6,
      message:
        `Don't delay your Ireland Employer Sponsored Work Visa file! Send your CV today so our senior review team can assess your job eligibility. 🇮🇪`,
    },
    {
      day: 7,
      message:
        `Final Reminder: Please share your CV with us today to proceed with your Ireland Employer Sponsored Work Visa application. 📄`,
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
