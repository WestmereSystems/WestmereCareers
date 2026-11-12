/** Fictional fixtures for the local preview. Never seed these as genuine vacancies. */
export type Job = {
  id: string;
  title: string;
  company: string;
  companyInitial: string;
  category: string;
  location: string;
  city: string;
  state: string;
  workMode: "Hybrid" | "Remote" | "On-site";
  employmentType: "Full time" | "Part time" | "Contract" | "Casual";
  salaryMin: number;
  salaryMax: number;
  salaryPeriod: "year" | "hour";
  superIncluded: boolean;
  postedAt: string;
  source: "direct" | "external";
  externalUrl?: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  tags: string[];
  responseDays: number | null;
  responseReports: number;
  noResponseReports: number;
  eligibleReports: number;
  companySize: string;
  companyDescription: string;
};

type JobInput = Omit<
  Job,
  | "companyInitial"
  | "location"
  | "salaryPeriod"
  | "superIncluded"
  | "source"
  | "responseReports"
  | "noResponseReports"
  | "eligibleReports"
  | "companySize"
> &
  Partial<
    Pick<
      Job,
      | "salaryPeriod"
      | "superIncluded"
      | "source"
      | "responseReports"
      | "noResponseReports"
      | "eligibleReports"
      | "companySize"
    >
  >;

const makeJob = (job: JobInput): Job => ({
  companyInitial: job.company.slice(0, 1),
  location:
    job.city === "Anywhere in Australia"
      ? "Anywhere in Australia"
      : `${job.city}, ${job.state}`,
  salaryPeriod: "year",
  superIncluded: false,
  source: "direct",
  responseReports: 0,
  noResponseReports: 0,
  eligibleReports: 0,
  companySize: "20–50 people",
  ...job,
});

export const demoJobs: Job[] = [
  makeJob({
    id: "demo-fernbridge-designer",
    title: "Senior Product Designer",
    company: "Fernbridge Studio",
    category: "Design & creative",
    city: "Melbourne",
    state: "VIC",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 120000,
    salaryMax: 145000,
    postedAt: "2026-11-12T00:10:00Z",
    responseDays: 5,
    responseReports: 22,
    noResponseReports: 4,
    eligibleReports: 26,
    description:
      "Shape useful digital experiences with a small, collaborative product team. Follow meaningful problems from early research through to thoughtful, well-tested releases.",
    responsibilities: [
      "Lead discovery and interaction design for a core product area.",
      "Build and test prototypes with customers.",
      "Work closely with product and engineering to deliver accessible experiences.",
    ],
    requirements: [
      "A portfolio demonstrating thoughtful product design decisions.",
      "Experience planning research and turning findings into practical improvements.",
      "Confidence working with a multidisciplinary team.",
    ],
    skills: [
      "Figma",
      "User research",
      "Prototyping",
      "Interaction design",
      "Accessibility",
    ],
    tags: ["Flexible hours", "Learning budget"],
    companyDescription:
      "An independent digital product studio creating useful services for Australian communities.",
  }),
  makeJob({
    id: "demo-banksia-success",
    title: "Customer Success Manager",
    company: "Banksia Works",
    category: "Customer service",
    city: "Melbourne",
    state: "VIC",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 90000,
    salaryMax: 110000,
    postedAt: "2026-11-11T23:00:00Z",
    responseDays: null,
    description:
      "Help growing businesses make the most of a practical operations platform. Build lasting customer relationships and turn feedback into better everyday experiences.",
    responsibilities: [
      "Guide customers through onboarding and adoption.",
      "Plan useful account conversations and follow through on actions.",
      "Share customer insights with product and support teams.",
    ],
    requirements: [
      "Experience supporting business customers.",
      "Clear written and spoken communication.",
      "An organised approach to customer relationships.",
    ],
    skills: [
      "Customer success",
      "CRM",
      "Communication",
      "Onboarding",
      "Account management",
    ],
    tags: ["New employer", "Wellbeing leave"],
    companyDescription:
      "A growing software team helping small businesses work with greater clarity.",
  }),
  makeJob({
    id: "demo-grove-frontend",
    title: "Frontend Engineer",
    company: "Grove Digital",
    category: "Technology",
    city: "Melbourne",
    state: "VIC",
    workMode: "Remote",
    employmentType: "Full time",
    salaryMin: 115000,
    salaryMax: 140000,
    postedAt: "2026-11-11T21:30:00Z",
    responseDays: 4,
    responseReports: 18,
    noResponseReports: 2,
    eligibleReports: 20,
    description:
      "Build fast, accessible web applications for people who rely on them every day. Join a distributed team that values considered engineering and room to focus.",
    responsibilities: [
      "Deliver responsive interfaces with React and TypeScript.",
      "Improve accessibility and browser performance.",
      "Review changes and share useful engineering knowledge.",
    ],
    requirements: [
      "Professional experience building web interfaces.",
      "Confidence with automated testing and collaborative code review.",
      "Australian working hours with flexibility around your day.",
    ],
    skills: ["React", "TypeScript", "CSS", "Testing", "Accessibility"],
    tags: ["Remote within Australia", "Focus time"],
    companyDescription:
      "An Australian product consultancy building simple, dependable digital services.",
  }),
  makeJob({
    id: "demo-riverplain-operations",
    title: "Operations Coordinator",
    company: "Riverplain Group",
    category: "Administration & operations",
    city: "Melbourne",
    state: "VIC",
    workMode: "On-site",
    employmentType: "Full time",
    salaryMin: 75000,
    salaryMax: 85000,
    postedAt: "2026-11-11T04:00:00Z",
    source: "external",
    responseDays: 21,
    responseReports: 5,
    noResponseReports: 12,
    eligibleReports: 17,
    description:
      "Keep the day-to-day work of a busy operations team running smoothly. This fictional external listing illustrates how Westmere distinguishes applications managed elsewhere.",
    responsibilities: [
      "Coordinate schedules and supplier communication.",
      "Maintain accurate operational records.",
      "Help the team spot and improve recurring processes.",
    ],
    requirements: [
      "Experience in administration or operations.",
      "A practical and organised working style.",
      "Comfort using spreadsheets and shared calendars.",
    ],
    skills: [
      "Administration",
      "Excel",
      "Scheduling",
      "Communication",
      "Process improvement",
    ],
    tags: ["External application", "On-site team"],
    companyDescription:
      "A fictional operations business used to demonstrate candidate-reported response information.",
  }),
  makeJob({
    id: "demo-wattle-data",
    title: "Data Analyst",
    company: "Wattle Insight",
    category: "Technology",
    city: "Sydney",
    state: "NSW",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 100000,
    salaryMax: 125000,
    postedAt: "2026-11-10T23:45:00Z",
    responseDays: 6,
    responseReports: 16,
    noResponseReports: 3,
    eligibleReports: 19,
    description:
      "Make complex information easier to act on. Partner with product and operations teams to build trusted reporting and answer meaningful business questions.",
    responsibilities: [
      "Explore data using SQL and clear analytical methods.",
      "Create dependable dashboards and explain findings.",
      "Improve data quality with engineering and operational teams.",
    ],
    requirements: [
      "Experience analysing business or product data.",
      "Strong SQL skills and an understanding of data quality.",
      "The ability to explain a finding to a non-technical audience.",
    ],
    skills: ["SQL", "Python", "Power BI", "Data analysis", "Communication"],
    tags: ["Mentoring", "Hybrid flexibility"],
    companyDescription:
      "A small analytics practice helping organisations make evidence-led decisions.",
  }),
  makeJob({
    id: "demo-tidepool-marketing",
    title: "Digital Marketing Specialist",
    company: "Tidepool Collective",
    category: "Marketing & communications",
    city: "Brisbane",
    state: "QLD",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 85000,
    salaryMax: 105000,
    postedAt: "2026-11-10T22:00:00Z",
    responseDays: 7,
    responseReports: 13,
    noResponseReports: 2,
    eligibleReports: 15,
    description:
      "Bring thoughtful campaigns to life for growing local brands. Work across content, search and measurement with a team that cares about clear, honest communication.",
    responsibilities: [
      "Plan and deliver digital campaigns.",
      "Create clear campaign reports and useful recommendations.",
      "Collaborate with designers and writers on content.",
    ],
    requirements: [
      "Experience running digital marketing campaigns.",
      "A working understanding of search and analytics.",
      "Strong written communication and curiosity about customers.",
    ],
    skills: [
      "SEO",
      "Google Analytics",
      "Content marketing",
      "Copywriting",
      "Campaign management",
    ],
    tags: ["Creative team", "Learning budget"],
    companyDescription:
      "An independent marketing collective working with Australian small businesses.",
  }),
  makeJob({
    id: "demo-common-ground-nurse",
    title: "Registered Nurse",
    company: "Common Ground Health",
    category: "Healthcare & community",
    city: "Geelong",
    state: "VIC",
    workMode: "On-site",
    employmentType: "Part time",
    salaryMin: 42,
    salaryMax: 52,
    salaryPeriod: "hour",
    postedAt: "2026-11-10T02:30:00Z",
    responseDays: 3,
    responseReports: 19,
    noResponseReports: 1,
    eligibleReports: 20,
    companySize: "50–200 people",
    description:
      "Make space for attentive community care in a supportive clinical team. This part-time role offers a regular roster and a strong focus on continuity for patients.",
    responsibilities: [
      "Provide patient-centred nursing care.",
      "Maintain accurate clinical records.",
      "Work with the broader care team on safe treatment plans.",
    ],
    requirements: [
      "Current AHPRA nursing registration.",
      "Relevant clinical experience and clear communication.",
      "Commitment to safe, inclusive care.",
    ],
    skills: [
      "Nursing",
      "Patient care",
      "Clinical assessment",
      "Documentation",
      "Communication",
    ],
    tags: ["Regular roster", "Community care"],
    companyDescription:
      "A community health provider focused on accessible, respectful care.",
  }),
  makeJob({
    id: "demo-canopy-project",
    title: "Project Manager",
    company: "Canopy Civic",
    category: "Administration & operations",
    city: "Canberra",
    state: "ACT",
    workMode: "Hybrid",
    employmentType: "Contract",
    salaryMin: 130000,
    salaryMax: 155000,
    postedAt: "2026-11-09T22:00:00Z",
    responseDays: 8,
    responseReports: 11,
    noResponseReports: 4,
    eligibleReports: 15,
    description:
      "Guide a service improvement project from a clear plan to a useful outcome. Bring people together, manage risk and make the next step easy to understand.",
    responsibilities: [
      "Maintain delivery plans, budgets and project risks.",
      "Coordinate stakeholders and project reporting.",
      "Support a smooth transition into business operations.",
    ],
    requirements: [
      "Experience managing multidisciplinary projects.",
      "Confidence with delivery planning and stakeholder communication.",
      "Availability for a 12-month fixed-term contract.",
    ],
    skills: [
      "Project management",
      "Stakeholder management",
      "Budgeting",
      "Risk management",
      "Agile",
    ],
    tags: ["12-month contract", "Purposeful projects"],
    companyDescription:
      "A service-design and delivery practice working on public-interest projects.",
  }),
  makeJob({
    id: "demo-myrtle-accountant",
    title: "Financial Accountant",
    company: "Myrtle Partners",
    category: "Finance & accounting",
    city: "Adelaide",
    state: "SA",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 95000,
    salaryMax: 115000,
    postedAt: "2026-11-09T05:00:00Z",
    responseDays: 5,
    responseReports: 12,
    noResponseReports: 2,
    eligibleReports: 14,
    description:
      "Bring clarity to month-end reporting and support sound financial decisions. Join a collaborative finance team with time for careful work and professional growth.",
    responsibilities: [
      "Prepare month-end reports and reconciliations.",
      "Maintain accurate financial records and controls.",
      "Support audit preparation and process improvements.",
    ],
    requirements: [
      "Relevant accounting qualifications and practical experience.",
      "Strong spreadsheet and reconciliation skills.",
      "An organised, detail-focused approach.",
    ],
    skills: [
      "Accounting",
      "Excel",
      "Financial reporting",
      "Reconciliation",
      "Xero",
    ],
    tags: ["Study support", "Flexible start times"],
    companyDescription:
      "A fictional advisory business supporting growing Australian organisations.",
  }),
  makeJob({
    id: "demo-sunward-service",
    title: "Service Designer",
    company: "Sunward Services",
    category: "Design & creative",
    city: "Sydney",
    state: "NSW",
    workMode: "Hybrid",
    employmentType: "Contract",
    salaryMin: 125000,
    salaryMax: 150000,
    postedAt: "2026-11-08T23:15:00Z",
    responseDays: null,
    source: "external",
    description:
      "Help make an important customer service easier to navigate. Explore the whole journey, bring teams together and translate research into practical improvements.",
    responsibilities: [
      "Map current and future customer journeys.",
      "Plan workshops and research activities.",
      "Prototype improvements with operational teams.",
    ],
    requirements: [
      "A portfolio of service design work.",
      "Experience facilitating inclusive workshops.",
      "Comfort moving between research and delivery.",
    ],
    skills: [
      "Service design",
      "User research",
      "Journey mapping",
      "Facilitation",
      "Prototyping",
    ],
    tags: ["6-month contract", "External application"],
    companyDescription:
      "A fictional service organisation demonstrating external application journeys.",
  }),
  makeJob({
    id: "demo-silverleaf-support",
    title: "IT Support Specialist",
    company: "Silverleaf Systems",
    category: "Technology",
    city: "Perth",
    state: "WA",
    workMode: "On-site",
    employmentType: "Full time",
    salaryMin: 75000,
    salaryMax: 90000,
    postedAt: "2026-11-08T03:00:00Z",
    responseDays: 4,
    responseReports: 10,
    noResponseReports: 1,
    eligibleReports: 11,
    description:
      "Be the reassuring person who helps colleagues get unstuck. Support devices, systems and everyday technical questions in a friendly internal team.",
    responsibilities: [
      "Resolve service desk requests and document fixes.",
      "Set up devices and support Microsoft 365.",
      "Work with colleagues on reliable onboarding processes.",
    ],
    requirements: [
      "Experience in IT support or a related customer-facing role.",
      "Practical troubleshooting skills.",
      "Clear communication and a patient approach.",
    ],
    skills: [
      "IT support",
      "Troubleshooting",
      "Microsoft 365",
      "Networking",
      "Communication",
    ],
    tags: ["Training support", "Internal service desk"],
    companyDescription:
      "A technology team supporting locally based professional services businesses.",
  }),
  makeJob({
    id: "demo-eucalypt-content",
    title: "Content Designer",
    company: "Eucalypt Learning",
    category: "Design & creative",
    city: "Anywhere in Australia",
    state: "AU",
    workMode: "Remote",
    employmentType: "Full time",
    salaryMin: 95000,
    salaryMax: 115000,
    postedAt: "2026-11-07T23:00:00Z",
    responseDays: 6,
    responseReports: 15,
    noResponseReports: 3,
    eligibleReports: 18,
    description:
      "Turn complex learning experiences into clear, welcoming content. Work with researchers and designers to help people find the information they need.",
    responsibilities: [
      "Design useful content for digital learning journeys.",
      "Test language and structure with learners.",
      "Maintain accessible content patterns and guidance.",
    ],
    requirements: [
      "Experience writing and structuring digital content.",
      "A clear understanding of plain language.",
      "Examples of collaborative, user-centred work.",
    ],
    skills: [
      "Content design",
      "UX writing",
      "User research",
      "Accessibility",
      "Information architecture",
    ],
    tags: ["Remote within Australia", "Learning-focused team"],
    companyDescription:
      "An Australian education product team making learning easier to access.",
  }),
  makeJob({
    id: "demo-harbour-admin",
    title: "Administration Officer",
    company: "Harbour Community",
    category: "Administration & operations",
    city: "Hobart",
    state: "TAS",
    workMode: "On-site",
    employmentType: "Part time",
    salaryMin: 32,
    salaryMax: 37,
    salaryPeriod: "hour",
    postedAt: "2026-11-07T01:00:00Z",
    responseDays: 5,
    responseReports: 9,
    noResponseReports: 1,
    eligibleReports: 10,
    description:
      "Help a community team run well with friendly, reliable administration. Keep information organised and make the first point of contact a welcoming one.",
    responsibilities: [
      "Manage shared inboxes, bookings and records.",
      "Support meeting preparation and everyday administration.",
      "Respond to community enquiries with care.",
    ],
    requirements: [
      "Strong organisation and attention to detail.",
      "Confidence with common office software.",
      "Respectful and clear communication.",
    ],
    skills: [
      "Administration",
      "Microsoft Office",
      "Scheduling",
      "Customer service",
      "Communication",
    ],
    tags: ["Three days per week", "Community organisation"],
    companyDescription:
      "A fictional local organisation connecting people with community support.",
  }),
  makeJob({
    id: "demo-meadow-engineer",
    title: "Full Stack Developer",
    company: "Meadow Labs",
    category: "Technology",
    city: "Brisbane",
    state: "QLD",
    workMode: "Remote",
    employmentType: "Full time",
    salaryMin: 120000,
    salaryMax: 150000,
    postedAt: "2026-11-06T22:00:00Z",
    responseDays: 4,
    responseReports: 17,
    noResponseReports: 2,
    eligibleReports: 19,
    description:
      "Build dependable software across the stack, with a team that values small releases and thoughtful feedback. Help improve products used by local service providers.",
    responsibilities: [
      "Develop features across React interfaces and backend APIs.",
      "Design clear database queries and reliable tests.",
      "Review production feedback and improve performance.",
    ],
    requirements: [
      "Experience delivering web applications.",
      "Confidence with TypeScript and relational databases.",
      "A collaborative approach to code review and problem solving.",
    ],
    skills: ["TypeScript", "React", "Node.js", "SQL", "Testing"],
    tags: ["Remote within Australia", "Small product team"],
    companyDescription:
      "An independent software company building useful tools for service businesses.",
  }),
  makeJob({
    id: "demo-cedar-people",
    title: "People & Culture Advisor",
    company: "Cedar & Coast",
    category: "Human resources",
    city: "Melbourne",
    state: "VIC",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 100000,
    salaryMax: 120000,
    postedAt: "2026-11-06T04:00:00Z",
    responseDays: 7,
    responseReports: 14,
    noResponseReports: 4,
    eligibleReports: 18,
    description:
      "Support a thoughtful employee experience from onboarding to everyday advice. Work with leaders who want practical, fair and well-explained people processes.",
    responsibilities: [
      "Support employee enquiries and people processes.",
      "Help managers prepare clear, fair documentation.",
      "Improve onboarding and employee experience initiatives.",
    ],
    requirements: [
      "Experience in a generalist people or HR role.",
      "Knowledge of Australian employment practices.",
      "Discretion, sound judgement and clear communication.",
    ],
    skills: [
      "Human resources",
      "Employee relations",
      "Onboarding",
      "Communication",
      "Policy development",
    ],
    tags: ["Flexible hours", "Collaborative team"],
    companyDescription:
      "A locally owned business investing in sustainable growth and people development.",
  }),
  makeJob({
    id: "demo-bluegum-business",
    title: "Business Analyst",
    company: "Bluegum Advisory",
    category: "Administration & operations",
    city: "Sydney",
    state: "NSW",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 110000,
    salaryMax: 135000,
    postedAt: "2026-11-05T23:00:00Z",
    responseDays: 8,
    responseReports: 12,
    noResponseReports: 3,
    eligibleReports: 15,
    description:
      "Help teams understand a problem before deciding what to build. Connect people, processes and systems through clear analysis and collaborative discovery.",
    responsibilities: [
      "Map business processes and document requirements.",
      "Facilitate discovery with product and operational teams.",
      "Support testing and the rollout of improvements.",
    ],
    requirements: [
      "Experience in business analysis or process improvement.",
      "Strong facilitation and documentation skills.",
      "Comfort discussing technical and operational requirements.",
    ],
    skills: [
      "Business analysis",
      "Requirements gathering",
      "Process mapping",
      "Stakeholder management",
      "Agile",
    ],
    tags: ["Professional development", "Varied projects"],
    companyDescription:
      "An independent consulting practice supporting practical service improvements.",
  }),
  makeJob({
    id: "demo-orchard-retail",
    title: "Retail Team Member",
    company: "Orchard Everyday",
    category: "Retail & hospitality",
    city: "Melbourne",
    state: "VIC",
    workMode: "On-site",
    employmentType: "Casual",
    salaryMin: 33,
    salaryMax: 38,
    salaryPeriod: "hour",
    postedAt: "2026-11-05T03:00:00Z",
    responseDays: 3,
    responseReports: 23,
    noResponseReports: 3,
    eligibleReports: 26,
    description:
      "Make everyday shopping a friendlier experience in a small neighbourhood store. Help customers, care for the shop floor and work with a supportive rostered team.",
    responsibilities: [
      "Welcome customers and assist with product questions.",
      "Maintain stock presentation and a tidy shop floor.",
      "Process purchases accurately.",
    ],
    requirements: [
      "A friendly and reliable approach.",
      "Availability for some weekend shifts.",
      "Retail experience is useful but training is provided.",
    ],
    skills: [
      "Customer service",
      "Communication",
      "Teamwork",
      "Point of sale",
      "Stock management",
    ],
    tags: ["Training provided", "Casual loading included"],
    companyDescription:
      "A fictional neighbourhood retailer with a community-focused approach.",
  }),
  makeJob({
    id: "demo-clearwater-graduate",
    title: "Graduate Software Engineer",
    company: "Clearwater Tech",
    category: "Technology",
    city: "Adelaide",
    state: "SA",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 75000,
    salaryMax: 85000,
    postedAt: "2026-11-04T23:00:00Z",
    responseDays: 6,
    responseReports: 20,
    noResponseReports: 4,
    eligibleReports: 24,
    description:
      "Start your engineering career with patient mentoring and useful real-world work. Learn how a product team builds, tests and improves software together.",
    responsibilities: [
      "Build small, well-tested features with support.",
      "Take part in code review and team planning.",
      "Learn from customer feedback and production issues.",
    ],
    requirements: [
      "A relevant qualification or equivalent practical projects.",
      "Foundational programming and problem-solving skills.",
      "Curiosity and willingness to ask questions.",
    ],
    skills: ["JavaScript", "Git", "SQL", "Testing", "Teamwork"],
    tags: ["Graduate opportunity", "Structured mentoring"],
    companyDescription:
      "A product company offering supported pathways into professional software development.",
  }),
  makeJob({
    id: "demo-fernbridge-research",
    title: "UX Researcher",
    company: "Fernbridge Studio",
    category: "Design & creative",
    city: "Melbourne",
    state: "VIC",
    workMode: "Hybrid",
    employmentType: "Part time",
    salaryMin: 95000,
    salaryMax: 115000,
    postedAt: "2026-11-04T04:00:00Z",
    responseDays: 5,
    responseReports: 22,
    noResponseReports: 4,
    eligibleReports: 26,
    description:
      "Bring people’s experiences into product decisions. Plan accessible research and help teams turn what they learn into thoughtful changes. Annual pay shown is full-time equivalent; this role is 0.8 FTE.",
    responsibilities: [
      "Plan and conduct qualitative research.",
      "Synthesize findings into clear, usable insights.",
      "Support inclusive research practices across the team.",
    ],
    requirements: [
      "Experience conducting digital product research.",
      "Clear research planning and synthesis skills.",
      "Confidence presenting findings and their limitations.",
    ],
    skills: [
      "User research",
      "Interviews",
      "Usability testing",
      "Research synthesis",
      "Facilitation",
    ],
    tags: ["Four days per week", "Salary shown as FTE"],
    companyDescription:
      "An independent digital product studio creating useful services for Australian communities.",
  }),
  makeJob({
    id: "demo-horizon-sustainability",
    title: "Sustainability Coordinator",
    company: "Horizon Habitat",
    category: "Environment & sustainability",
    city: "Newcastle",
    state: "NSW",
    workMode: "Hybrid",
    employmentType: "Full time",
    salaryMin: 85000,
    salaryMax: 105000,
    postedAt: "2026-11-03T23:00:00Z",
    responseDays: null,
    description:
      "Help turn sustainability goals into practical everyday improvements. Work across teams to collect useful information, coordinate projects and share progress clearly.",
    responsibilities: [
      "Coordinate environmental reporting and improvement projects.",
      "Support data collection and quality checks.",
      "Create clear updates for colleagues and partners.",
    ],
    requirements: [
      "Relevant sustainability or project coordination experience.",
      "Confidence working with data and spreadsheets.",
      "An organised, collaborative approach.",
    ],
    skills: [
      "Sustainability",
      "Project coordination",
      "Excel",
      "Reporting",
      "Stakeholder management",
    ],
    tags: ["Purposeful work", "New employer"],
    companyDescription:
      "A small environmental services business helping communities improve their local places.",
  }),
];

export const isDemoJob = (id: string) => id.startsWith("demo-");
