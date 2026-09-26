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
        `Australia is actively hiring! 🇦🇺 The Australia Employer Sponsored Work Visa is a direct, fully employer-sponsored work visa allowing you to live and work in Australia with your family.\n\n` +
        `Tap below to learn how you can qualify:`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 2,
      message:
        `Did you know? Under the Australia Employer Sponsored Work Visa, your sponsoring Australian employer covers your nomination and legal fees! 💼\n\n` +
        `Don't miss this opportunity to advance your international career. Tap below:`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 3,
      message:
        `Employer-Covered Relocation: Sponsoring Australian employers often provide flight tickets, relocation support, and accommodation assistance! ✈️\n\n` +
        `Let us check if your occupation qualifies:`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 4,
      message:
        `Australian employers urgently need skilled workers across healthcare, trades, engineering, IT, hospitality, and management. They offer fully employer sponsored work visas! 🇦🇺\n\n` +
        `Are you ready to explore your options?`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 5,
      message:
        `Direct Pathway to Permanent Residency (PR): Working on an Australia Employer Sponsored Work Visa provides a clear transitional pathway to Australian permanent residency! 🌏\n\n` +
        `Take the first step today:`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 6,
      message:
        `Zero Recruitment Agency Fees: Australian employers cover the sponsorship charges. Our team helps connect you directly with approved sponsor opportunities.\n\n` +
        `Tap below to explore:`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 7,
      message:
        `Final Opportunity: Our Australian employer sponsorship assessment round is closing soon. If you wish to assess your eligibility for the Australia Employer Sponsored Work Visa, tap below.\n\n` +
        `Otherwise, no further messages will be sent!`,
      buttons: [
        { id: "BTN_482_YES", title: "Yes, Interested" },
        { id: "BTN_482_NO", title: "Not Right Now" },
      ],
    },
  ],

  // Step 2: Request Email Address
  STEP_2_EMAIL: [
    {
      day: 1,
      message:
        `We are waiting to share all the visa details with you! 📩\n\n` +
        `Please reply with your email address so our migration team can send you the complete Australia Employer Sponsored Work Visa information pack.`,
    },
    {
      day: 2,
      message:
        `Australian employers are waiting for profiles like yours! 🇦🇺\n\n` +
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
        `It only takes 5 seconds: Simply drop your email address below (e.g. yourname@gmail.com) so we can send the official Australian work visa guide to your inbox. 📩`,
    },
    {
      day: 5,
      message:
        `Australian sponsor employers have priority openings this quarter. Please provide your email address right here so our evaluation desk can forward the occupation list to you!`,
    },
    {
      day: 6,
      message:
        `Candidate shortlisting is in progress for Australian employers. Please reply with your email address so your profile can be considered for direct sponsorship. 🇦🇺`,
    },
    {
      day: 7,
      message:
        `Final Reminder: Share your email address today to receive the Australia Employer Sponsored Work Visa information pack. This is our last reminder! 📩`,
    },
  ],

  // Step 3: Book Consultation Meeting
  STEP_3_CONSULTATION: [
    {
      day: 1,
      message:
        `This is a fully employer-sponsored work visa where the Australian employer pays major charges! 🇦🇺\n\n` +
        `Book a free 1-on-1 meeting with us to know more about the Australia Employer Sponsored Work Visa:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 2,
      message:
        `You don't need to pay anything upfront for employer nomination — Australian employers cover the sponsorship! 💼\n\n` +
        `Book your free 1-on-1 consultation to speak with our migration expert:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 3,
      message:
        `Australian employers pay the amount for your sponsorship. Book a free 1-on-1 video meeting with our senior advisor this weekend to verify your job eligibility! ✈️`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 4,
      message:
        `Weekend Consultations Open: Our senior Australian visa consultants have limited free 1-on-1 video slots this Saturday and Sunday. Tap below to reserve your free call:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Consultation" },
        { id: "BTN_CONSULT_NO", title: "Maybe Later" },
      ],
    },
    {
      day: 5,
      message:
        `Verify your occupation and discover how Australian employers sponsor overseas skilled candidates on the Australia Employer Sponsored Work Visa. Book your free consultation today! 🇦🇺`,
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
        `Last Reminder: Book your free 1-on-1 Australian visa strategy session before weekend slots close. Tap below to schedule, or reply whenever you are ready!`,
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
        `Please select your preferred date to speak with our Australian visa specialist:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 2,
      message:
        `Talk 1-on-1 with our live Australian visa agent! 🤝\n\n` +
        `Pick a date on the calendar to discuss the Australia Employer Sponsored Work Visa:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 3,
      message:
        `Know more about the Australia Employer Sponsored Work Visa: Tap below to pick an upcoming Saturday or Sunday that fits your schedule! 🇦🇺`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 4,
      message:
        `Consultation slots are filling fast for this weekend! Choose your date now so our senior advisor can evaluate your file:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 5,
      message:
        `Reserve 15 minutes to verify your qualifications and job category with our visa desk. Pick a date below:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 6,
      message:
        `Don't let your Australian employer sponsorship opportunity slip. Select your consultation date today to lock in your session:`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
    {
      day: 7,
      message:
        `Final Reminder: Choose your consultation date today to connect 1-on-1 with our Australian migration team. 🇦🇺`,
      buttons: [{ id: "BTN_RESCHEDULE", title: "Select Date" }],
    },
  ],

  // Step 4 Slot: Select Time Slot
  STEP_4_SLOT: [
    {
      day: 1,
      message:
        `You selected your consultation date! ⏰\n\n` +
        `Please pick your convenient time slot (between 01:00 PM and 09:00 PM IST) to lock in your meeting:`,
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
        `Complete your booking in 10 seconds: Select a time slot to confirm your 1-on-1 Australia Employer Sponsored Work Visa consultation! 📅`,
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
        `Quick reminder: Sponsoring employers are looking for eligible applicants. Pick an available time slot to finalize your consultation:`,
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

  // Step 6: Post-Meeting CV Intake
  STEP_6_CV: [
    {
      day: 1,
      message:
        `Please share your CV / Resume with us! 📄\n\n` +
        `Our compliance and employer matching team is waiting to verify your Australia Employer Sponsored Work Visa eligibility.`,
    },
    {
      day: 2,
      message:
        `This visa is fully sponsored by your employer, so please share your CV to move forward! 🇦🇺\n\n` +
        `Send it in PDF or Word document format right here.`,
    },
    {
      day: 3,
      message:
        `Our Australian employer matching team is waiting for your CV. Upload your resume here on WhatsApp so we can prepare your file! 📄`,
    },
    {
      day: 4,
      message:
        `We need your updated CV to match your experience with active Australian sponsoring companies. Please attach it here.`,
    },
    {
      day: 5,
      message:
        `Fast-track your employer sponsorship application: Simply send your CV here in PDF or Word format so our evaluators can review. 💼`,
    },
    {
      day: 6,
      message:
        `Don't delay your Australia Employer Sponsored Work Visa file! Send your CV today so our senior review team can assess your job eligibility. 🇦🇺`,
    },
    {
      day: 7,
      message:
        `Final Reminder: Please share your CV with us today to proceed with your Australia Employer Sponsored Work Visa application. 📄`,
    },
  ],

  // Step 7: Cancelled Meeting Rescheduling
  STEP_7_RESCHEDULE: [
    {
      day: 1,
      message:
        `Unfortunately your consultation meeting could not take place with us today.\n\n` +
        `Please reschedule your meeting with us by choosing a date below:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 2,
      message:
        `We missed you! 🤝 Please reschedule your free 1-on-1 consultation so our team can evaluate your Australia Employer Sponsored Work Visa file:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 3,
      message:
        `Don't lose your spot: Australian employers are actively hiring. Tap below to pick a new consultation date on an upcoming weekend! 🇦🇺`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 4,
      message:
        `Weekend slots are open: Reschedule your 1-on-1 meeting (Saturdays & Sundays, 01:00 PM – 09:00 PM IST) to reconnect with our advisor:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 5,
      message:
        `Free eligibility review: Reschedule your meeting today to find out which Australian employers can sponsor your visa! ✈️`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 6,
      message:
        `Consultation openings are limited this weekend. Tap below to choose your new date and time for a 1-on-1 video call:`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
    {
      day: 7,
      message:
        `Final Rescheduling Reminder: Tap below to reschedule your consultation with our Australian migration team whenever you are ready. 🇦🇺`,
      buttons: [{ id: "BTN_RESCHEDULE_MEETING", title: "Reschedule Meeting" }],
    },
  ],
};
