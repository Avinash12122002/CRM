/**
 * Official Ireland Work Permit Occupation Lists
 * Source: Department of Enterprise, Trade and Employment (DETE), Government of Ireland
 *
 * THREE-WAY ELIGIBILITY LOGIC:
 * 1. If occupation is on CSOL → Critical Skills Employment Permit (CSEP) — 3-4 months, Stamp 4 PR after 2 years
 * 2. If occupation is on IOL  → INELIGIBLE — employment permit cannot be granted
 * 3. If occupation is on NEITHER list → General Employment Permit (GEP) — 4-5 months
 *
 * EXPERIENCE REQUIREMENT: Minimum 2 years of experience in the occupation is required.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL SKILLS OCCUPATIONS LIST (CSOL)
// ─────────────────────────────────────────────────────────────────────────────
export const CSOL_OCCUPATIONS: Record<string, string[]> = {
  "Management & Directors": [
    "Site Manager",
    "IT Director",
    "Information Technology Director",
    "Telecommunications Director",
    "Senior Health Services Manager",
    "Public Health Manager",
    "Professional Forester",
    "Resource Modelling Analyst",
    "Earth Observation Analyst",
    "Data Analyst",
  ],
  "Natural & Life Sciences": [
    "Chemical Scientist",
    "Food Scientist",
    "Beverage Scientist",
    "Medical Device Scientist",
    "Product Development Scientist",
    "Analytical Development Scientist",
    "Clinical Vigilance Scientist",
    "Biotechnologist",
    "Medical Laboratory Scientist",
    "Biological Scientist",
    "Biochemist",
    "Agronomist",
    "Physical Scientist",
    "Meteorologist",
    "Operational Forecaster",
  ],
  "Engineering": [
    "Civil Engineer",
    "Structural Engineer",
    "Site Engineer",
    "Mechanical Engineer",
    "Electrical Engineer",
    "Electronics Engineer",
    "Chip Design Engineer",
    "Test Engineer",
    "Application Engineer",
    "Process Automation Engineer",
    "Power Generation Engineer",
    "Power Transmission Engineer",
    "Power Distribution Engineer",
    "Design Engineer",
    "Development Engineer",
    "Quality Control Engineer",
    "Validation Engineer",
    "Regulation Engineer",
    "Production Engineer",
    "Process Engineer",
    "Chemical Process Engineer",
    "Chemical Engineer",
    "Material Scientist",
    "Setting Out Engineer",
    "Façade Designer",
    "Project Engineer",
  ],
  "ICT & Technology": [
    "IT Specialist Manager",
    "BIM Manager",
    "IT Project Manager",
    "IT Programme Manager",
    "IT Business Analyst",
    "IT Architect",
    "Systems Designer",
    "Programmer",
    "Software Developer",
    "Software Development Professional",
    "Web Designer",
    "Web Developer",
    "ICT Professional",
    "Technology Professional",
    "Full Stack Developer",
    "Front End Developer",
    "Back End Developer",
    "Cloud Architect",
    "DevOps Engineer",
    "Cybersecurity Specialist",
    "Data Scientist",
    "Data Engineer",
    "Machine Learning Engineer",
    "AI Specialist",
    "Database Administrator",
    "Solutions Architect",
    "QA Automation Engineer",
    "Network Engineer",
    "ERP Consultant",
    "Business Intelligence Developer",
    "UI/UX Designer",
    "Mobile App Developer",
  ],
  "Health & Medical": [
    "Medical Practitioner",
    "Doctor",
    "General Practitioner",
    "GP",
    "Hospital Doctor",
    "Consultant",
    "Surgeon",
    "Anaesthetist",
    "Cardiologist",
    "Radiologist",
    "Psychiatrist",
    "Paediatrician",
    "Psychologist",
    "Clinical Psychologist",
    "Pharmacist",
    "Industrial Pharmacist",
    "Optometrist",
    "Ophthalmic Optician",
    "Radiographer",
    "Radiation Therapist",
    "Cardiac Physiologist",
    "Vascular Technologist",
    "Gastro Intestinal Technologist",
    "Respiratory Physiologist",
    "Podiatrist",
    "Chiropodist",
    "Audiologist",
    "Perfusionist",
    "Dietician",
    "Dietitian",
    "Medical Scientist",
  ],
  "Therapy Professionals": [
    "Physiotherapist",
    "Occupational Therapist",
    "Speech Therapist",
    "Language Therapist",
    "Speech and Language Therapist",
    "Orthoptist",
  ],
  "Nursing & Midwifery": [
    "Registered Nurse",
    "Staff Nurse",
    "Senior Staff Nurse",
    "Clinical Nurse Manager",
    "ICU Nurse",
    "Critical Care Nurse",
    "Theatre Nurse",
    "Paediatric Nurse",
    "Mental Health Nurse",
    "Midwife",
    "Registered Midwife",
  ],
  "Education & Academic": [
    "University Lecturer",
    "Professor",
    "Academic",
    "Lecturer",
    "Postdoctoral Researcher",
    "Senior Research Fellow",
  ],
  "Legal & Professional": [
    "Intellectual Property Professional",
    "IP Lawyer",
    "Patent Attorney",
  ],
  "Finance, Accounting & Business": [
    "Chartered Accountant",
    "Certified Accountant",
    "Tax Specialist",
    "Tax Consultant",
    "Tax Expert",
    "Financial Auditor",
    "CPA",
    "Management Consultant",
    "Business Analyst",
    "Big Data Analyst",
    "Financial Project Manager",
    "Investment Analyst",
    "Risk Analyst",
    "Credit Analyst",
    "Fraud Analyst",
    "Actuary",
    "Economist",
    "Statistician",
    "Data Mining Specialist",
    "Actuarial Specialist",
  ],
  "Architecture, Construction & Surveying": [
    "Architect",
    "Town Planning Officer",
    "Town Planner",
    "Quantity Surveyor",
    "Geospatial Surveyor",
    "Land Surveyor",
    "Geomatics Surveyor",
    "Construction Project Manager",
    "Construction Planner",
    "Construction Scheduler",
    "Commercial Manager",
    "Architectural Technologist",
    "BIM Coordinator",
    "BIM Technician",
  ],
  "Welfare & Social Work": [
    "Social Worker",
  ],
  "Quality, Regulatory & Environment": [
    "Quality Control Planner",
    "Quality Control Engineer",
    "Quality Assurance Professional",
    "Regulatory Affairs Professional",
    "Environmental Health Professional",
    "Regulatory Specialist",
  ],
  "Animation, Games & Media": [
    "Art Director",
    "Animation Art Director",
    "Animation Background Artist",
    "Animation Design Artist",
    "Rigger",
    "Games Rigger",
    "Location Designer",
    "Character Designer",
    "Prop Designer",
    "Animation Layout Artist",
  ],
  "Health Associate Professionals": [
    "Paramedic",
    "Advanced Paramedic Practitioner",
    "Prosthetist",
    "Orthotist",
  ],
  "Sales & Marketing (Specialist)": [
    "International Sales Executive",
    "International Marketing Expert",
    "B2B Sales Specialist",
    "International Marketing Manager",
  ],
  "Hospitality (Senior Chefs Only)": [
    "Executive Chef",
    "Head Chef",
    "Sous Chef",
    "Chef de Partie",
    "Commis Chef",
  ],
  "Sports (Elite Coaches)": [
    "High Performance Coach",
    "High Performance Director",
    "National Sports Coach",
    "Sports Director",
  ],
  "Construction Technical": [
    "Estimator",
  ],
  "Agriculture (Specialist)": [
    "Professional Forester",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// INELIGIBLE OCCUPATIONS LIST (IOL)
// Employment permits shall NOT be granted for these roles
// ─────────────────────────────────────────────────────────────────────────────
export const IOL_OCCUPATIONS: string[] = [
  // Hospitality & Leisure Managers
  "Leisure Facilities Manager", "Sports Facilities Manager", "Travel Agency Manager",
  "Residential Care Manager", "Day Care Manager", "Domiciliary Care Manager",
  "Property Manager", "Housing Manager", "Estate Manager", "Garage Manager",
  "Hairdressing Salon Manager", "Beauty Salon Manager", "Shopkeeper",
  "Waste Disposal Manager", "Environmental Services Manager", "Betting Shop Manager",
  "Library Manager", "Plant Hire Manager", "Production Manager",
  // Welfare (Non-specialist)
  "Probation Officer",
  // Planning technical
  "Town Planning Technician",
  // Health associate (non-specialist)
  "Acupuncturist", "Homeopath", "Hypnotherapist", "Massage Therapist",
  "Reflexologist", "Sports Therapist",
  // Welfare & Housing
  "Youth Worker", "Community Worker", "Child Care Officer", "Early Years Officer",
  "Housing Officer", "Counsellor", "Welfare Worker",
  // Protective Services
  "Army NCO", "Police Officer", "Fire Service Officer", "Prison Officer",
  "Police Community Support Officer",
  // Fitness
  "Fitness Instructor", "Personal Trainer", "Gym Instructor",
  // Legal Associate (non-language specialist)
  "Legal Associate Professional",
  // Estate & Sales
  "Estate Agent", "Auctioneer", "Conference Manager", "Exhibition Manager",
  // Public Services
  "Public Services Associate", "Vocational Trainer", "Industrial Trainer",
  "Careers Adviser", "Vocational Guidance Specialist", "Regulatory Inspector",
  "Health and Safety Officer",
  // Government Admin
  "Government Administrator", "Local Government Officer",
  // Financial Admin
  "Credit Controller", "Bookkeeper", "Payroll Manager", "Wages Clerk",
  "Bank Clerk", "Post Office Clerk", "Finance Officer", "Records Clerk",
  "Pensions Clerk", "Insurance Clerk", "Stock Control Clerk", "Library Clerk",
  "Human Resources Administrator", "Sales Administrator", "Office Manager", "Office Supervisor",
  // Secretarial
  "Medical Secretary", "Legal Secretary", "School Secretary", "Company Secretary",
  "Personal Assistant", "Receptionist", "Typist",
  // Agriculture
  "Farmer", "Horticultural Worker", "Gardener", "Landscape Gardener", "Groundsman",
  "Greenkeeper",
  // Vehicle Trades
  "Boat Builder", "Ship Builder", "Rail Builder", "Rolling Stock Repairer",
  // Electrical trades
  "TV Engineer", "Video Engineer", "Audio Engineer",
  // Construction
  // Textiles
  "Weaver", "Knitter", "Footwear Worker", "Leather Worker",
  // Printing
  "Pre-press Technician", "Print Finisher", "Binding Worker",
  // Food/Hospitality Trades
  "Flour Confectioner", "Fishmonger", "Poultry Dresser", "Cook",
  // Skilled Trades
  "Glass Maker", "Ceramics Maker", "Florist",
  // Childcare
  "Nursery Nurse", "Childminder", "Teaching Assistant", "Educational Support Assistant",
  // Animal Care
  "Veterinary Nurse", "Pest Control Officer",
  // Caring Services
  "Ambulance Staff", "Dental Nurse", "Residential Warden", "Senior Care Worker",
  "Care Escort", "Undertaker", "Mortuary Assistant",
  // Leisure & Travel
  "Sports Leisure Assistant", "Travel Agent", "Air Travel Assistant", "Rail Travel Assistant",
  // Hairdressing & Beauty
  "Hairdresser", "Barber", "Beautician",
  // Housekeeping
  "Housekeeper", "Caretaker", "Cleaning Manager",
  // Sales & Retail
  "Sales Assistant", "Retail Assistant", "Retail Cashier", "Checkout Operator",
  "Telephone Salesperson", "Pharmacy Dispensing Assistant", "Vehicle Salesperson",
  "Collector Salesperson", "Debt Collector", "Roundsperson", "Van Salesperson",
  "Market Trader", "Street Trader", "Merchandiser", "Window Dresser",
  "Sales Supervisor",
  // Customer Service
  "Call Centre Agent", "Contact Centre Agent", "Telephonist", "Communication Operator",
  "Market Research Interviewer", "Customer Service Manager", "Customer Service Supervisor",
  // Process Operatives
  "Food Process Operative", "Drink Process Operative", "Tobacco Process Operative",
  "Glass Process Operative", "Ceramics Process Operative", "Chemical Process Operative",
  "Rubber Process Operative", "Plastics Process Operative", "Metal Process Operative",
  "Electroplater",
  // Plant & Machine
  "Paper Machine Operative", "Coal Mine Operative", "Quarry Worker", "Energy Plant Operative",
  "Metal Working Machine Operative", "Water Plant Operative", "Printing Machine Assistant",
  // Assemblers
  "Electrical Assembler", "Vehicle Assembler", "Metal Goods Assembler", "Routine Inspector",
  "Tyre Fitter", "Exhaust Fitter", "Windscreen Fitter", "Sewing Machinist",
  // Construction Operatives
  "Road Construction Operative", "Rail Construction Operative",
  // Transport
  "Van Driver", "Bus Driver", "Coach Driver", "Taxi Driver", "Cab Driver",
  "Chauffeur", "Driving Instructor", "Forklift Driver", "Agricultural Machinery Driver",
  "Train Driver", "Tram Driver", "Marine Transport Operative", "Air Transport Operative",
  // Elementary
  "Farm Worker", "Elementary Construction Worker", "Industrial Cleaner",
  "Packer", "Bottler", "Canner", "Postal Worker", "Mail Sorter", "Messenger", "Courier",
  "Window Cleaner", "Street Cleaner", "Cleaner", "Launderer", "Dry Cleaner",
  "Refuse Collector", "Vehicle Valeter", "Security Guard", "Parking Enforcement Officer",
  "School Crossing Patrol", "Shelf Filler", "Storage Worker",
  "Hospital Porter", "Kitchen Assistant", "Catering Assistant", "Waiter", "Waitress",
  "Bar Staff", "Leisure Park Attendant",
  // Domestic
  "Domestic Worker",
];

// ─────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY RESULT TYPE
// ─────────────────────────────────────────────────────────────────────────────
export type EligibilityStatus = "CSEP" | "GEP" | "INELIGIBLE";

export interface OccupationResult {
  status: EligibilityStatus;
  role: string;
  category?: string;
  // Friendly message for the AI to use
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ELIGIBILITY CHECKER
// ─────────────────────────────────────────────────────────────────────────────
export function checkIrelandOccupationEligibility(query: string): OccupationResult | null {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 3) return null;

  const ignoreSet = new Set([
    "the", "and", "for", "with", "from", "list", "apply", "visa",
    "work", "role", "jobs", "ireland", "permit", "i", "am", "a", "an",
  ]);

  // Helper: score match between query and a role string
  function matches(roleStr: string): boolean {
    const lowerR = roleStr.toLowerCase();
    if (lowerR === q) return true;
    if (q.includes(lowerR)) return true;
    if (lowerR.includes(q)) return true;
    const cleanR = lowerR.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if (cleanR.length >= 4 && !ignoreSet.has(cleanR)) {
      // All significant words in the role must appear in the query
      const words = cleanR.split(" ").filter((w) => w.length >= 3 && !ignoreSet.has(w));
      if (words.length > 0 && words.every((w) => q.includes(w))) return true;
    }
    return false;
  }

  // 1. Check CSOL (Critical Skills Occupations List) first — best pathway, CSEP
  for (const [category, roles] of Object.entries(CSOL_OCCUPATIONS)) {
    for (const role of roles) {
      if (matches(role)) {
        return {
          status: "CSEP",
          role,
          category,
          message:
            `Great news! 🎉 Your occupation **"${role}"** is on the official Irish **Critical Skills Occupations List (CSOL)** ` +
            `under the **${category}** sector!\n\n` +
            `✅ **Permit Type:** Critical Skills Employment Permit (CSEP)\n` +
            `✅ **Timeline:** 3–4 months (fastest pathway)\n` +
            `✅ **PR Pathway:** Stamp 4 Permanent Residency after just 2 years of work in Ireland 🇮🇪\n` +
            `✅ **Employer covers:** €1,000 permit fee + €60 visa fee + flight tickets\n\n` +
            `With a minimum of 2 years' experience in your field, you are well-positioned. ` +
            `Would you like to book a free consultation to discuss next steps? 📩`,
        };
      }
    }
  }

  // 2. Check IOL (Ineligible list) — these cannot get an employment permit
  for (const role of IOL_OCCUPATIONS) {
    if (matches(role)) {
      return {
        status: "INELIGIBLE",
        role,
        message:
          `I'm sorry, but the role **"${role}"** is on Ireland's **Ineligible Occupations List (IOL)** — ` +
          `meaning an employment permit cannot be granted for this occupation under current Irish government regulations. ` +
          `Our team would be happy to discuss if your skills could qualify under a related eligible occupation. ` +
          `Please book a free consultation to explore your options! 🇮🇪`,
      };
    }
  }

  // 3. Not in CSOL, not in IOL → General Employment Permit (GEP)
  const cleanQuery = q.replace(/[^a-z\s]/g, "").trim();
  if (cleanQuery.length >= 3) {
    return {
      status: "GEP",
      role: query.trim(),
      message:
        `Your occupation **"${query.trim()}"** is not on the Critical Skills list but also not on the Ineligible list — ` +
        `which means you qualify for the **General Employment Permit (GEP)** under Irish immigration rules! 🇮🇪\n\n` +
        `✅ **Permit Type:** General Employment Permit (GEP)\n` +
        `✅ **Timeline:** 4–5 months\n` +
        `✅ **Employer covers:** Work permit fees + visa + flight tickets\n` +
        `✅ **Requirement:** Minimum 2 years of experience in your occupation\n\n` +
        `Book a free 1-on-1 consultation with our Senior Ireland Migration Expert to confirm eligibility for your specific role! 📩`,
    };
  }

  return null;
}

/**
 * Legacy compatibility — used in ai.ts context block for exact CSOL match
 */
export function findEligibleOccupation(query: string): {
  role: string;
  category: string;
} | null {
  const result = checkIrelandOccupationEligibility(query);
  if (result && result.status === "CSEP" && result.category) {
    return { role: result.role, category: result.category };
  }
  return null;
}
