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
        `And TMS provides FREE Interview Preparation & English communication coaching from your very first weekend.\n\n` +
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

  // Step 3: Video Sent / Awaiting Interest
  STEP_3_VIDEO: [
    {
      day: 1,
      message:
        `Did you get a chance to watch our Ireland Work Visa explainer video? 🎬\n\n` +
        `It explains the employer sponsorship, DETE work permit, and Stamp 4 PR pathway in under 2 minutes!`,
      buttons: [
        { id: "BTN_IRELAND_YES", title: "Watched It!" },
        { id: "BTN_IRELAND_NO", title: "Send Link Again" },
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

  // Step 4: Consultation Decision / Selecting Slot
  STEP_4_CONSULTATION: [
    {
      day: 1,
      message:
        `We have open consultation slots available! 📅\n\n` +
        `Tap below to select an available time in your local timezone:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Choose Slot" },
        { id: "BTN_CONSULT_NO", title: "Later" },
      ],
    },
    {
      day: 2,
      message:
        `Weekday consultation slots for our Ireland Migration Specialist fill up quickly. Secure your slot today! ⏰`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Select Slot" },
        { id: "BTN_CONSULT_NO", title: "Not Now" },
      ],
    },
    {
      day: 3,
      message:
        `Consultations are 100% free, 1-on-1 via Google Meet, and scheduled strictly in your local timezone! 🌐`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Free Slot" },
        { id: "BTN_CONSULT_NO", title: "Later" },
      ],
    },
    {
      day: 4,
      message:
        `Have questions about the €300 initial fee, English coaching, or Irish employer interviews? Our expert will explain everything in detail.`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Call" },
        { id: "BTN_CONSULT_NO", title: "Not Right Now" },
      ],
    },
    {
      day: 5,
      message:
        `New weekday slots have just been opened! Pick a time that suits your schedule:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "View Slots" },
        { id: "BTN_CONSULT_NO", title: "Skip" },
      ],
    },
    {
      day: 6,
      message:
        `Almost out of slots for this week. Reserve your 1-on-1 Ireland migration assessment:`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Reserve Slot" },
        { id: "BTN_CONSULT_NO", title: "Not Now" },
      ],
    },
    {
      day: 7,
      message:
        `Final invitation for this week's Ireland consultations. Tap below or reply whenever you'd like to schedule. 🇮🇪`,
      buttons: [
        { id: "BTN_CONSULT_YES", title: "Book Now" },
        { id: "BTN_CONSULT_NO", title: "Close" },
      ],
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

  // Step 6: Payment Pending (€300 Initial Fee)
  STEP_6_PAYMENT: [
    {
      day: 1,
      message:
        `Your Ireland consultation was completed successfully! 🎉\n\n` +
        `To proceed, your initial milestone of **€300** is due. This covers:\n` +
        `• Dedicated TMS Case Manager from Day 1\n` +
        `• European/Irish-standard professional CV makeover\n` +
        `• FREE weekly English communication coaching\n` +
        `• FREE Interview Preparation coaching\n` +
        `• TMS books your interviews with Irish employers\n\n` +
        `Pay the remaining €700 ONLY after visa approval & flight tickets are in hand! 🇮🇪`,
    },
    {
      day: 2,
      message:
        `Your 1-Year Professional Services Agreement is ready! 📋\n\n` +
        `Complete your €300 initial milestone to activate your Case Manager, Irish CV makeover, free English coaching & Interview Preparation — all starting this week.\n\n` +
        `Remember: €700 balance only after your Irish visa and flight tickets are confirmed!`,
    },
    {
      day: 3,
      message:
        `Our Ireland service is backed by a **100% Money-Back Guarantee**. 🛡️\n\n` +
        `If your visa is rejected for ANY reason, we refund ALL your payments immediately — no questions asked.\n\n` +
        `You only pay the €700 balance once your visa and flights are confirmed in hand! ✈️`,
    },
    {
      day: 4,
      message:
        `Our recruitment team has active openings in Ireland for your occupation. Clear your €300 initial fee to submit your profile to hiring managers. 🇮🇪`,
    },
    {
      day: 5,
      message:
        `Have any questions about the agreement or payment methods? Reply here to speak with our billing coordinator.`,
    },
    {
      day: 6,
      message:
        `Your reserved employer marketing queue for Ireland expires soon. Complete your €300 initial enrollment to secure your spot.`,
    },
    {
      day: 7,
      message:
        `Final notice regarding your Ireland onboarding enrollment. Message us anytime you're ready to activate your application! 🇮🇪`,
    },
  ],
};
