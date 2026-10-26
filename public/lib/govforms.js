// Government form specifications.
//
// Two very different cases live in this file, and conflating them would be the
// easiest way to hand a founder a fake document:
//
//   1. IRS Form SS-4 is a public-domain federal form. IRS Publication 1167 says
//      "You can photocopy most tax forms and use them instead of the official
//      ones", provided the entire substitute form is legible. So a full layout
//      replica is both lawful and useful.
//
//   2. State formation documents are NOT uniform. Some states publish a numbered
//      form (California ARTS-GS, Texas Form 201). Others publish no paper form at
//      all and take the filing through an online portal (Colorado, Montana, Utah,
//      Vermont, New Jersey, New Mexico). Delaware publishes only a SAMPLE
//      certificate — the incorporator drafts the document. Georgia issues no
//      numbered articles form for corporations at all.
//
// For case 2 the renderer emits the document the state actually accepts, and
// labels it as drafted rather than passing it off as an official state form.
// Each jurisdiction carries `printable` so that distinction is data, not prose.

// --- IRS Form SS-4 ----------------------------------------------------------

export const SS4 = {
  formNumber: 'Form SS-4',
  revision: 'December 2025',
  omb: '1545-0003',
  title: 'Application for Employer Identification Number',
  subtitle: '(For use by employers, corporations, partnerships, trusts, estates, churches, government agencies, Indian tribal entities, certain individuals, and others.)',
  agency: 'Department of the Treasury',
  bureau: 'Internal Revenue Service',
  seeInstructions: 'See separate instructions for each line.',
  keepCopy: 'Keep a copy for your records.',
  officialPdf: 'https://www.irs.gov/pub/irs-pdf/fss4.pdf',
  instructionsUrl: 'https://www.irs.gov/instructions/iss4',
  aboutUrl: 'https://www.irs.gov/forms-pubs/about-form-ss-4',
  reproductionPolicy:
    'IRS Publication 1167: "You can photocopy most tax forms and use them instead of the official ones." The entire substitute form, including entries, must be legible.',
  // Filing channels, verified against the IRS "Where to file" guidance.
  channels: {
    online:
      'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
    faxInland: '855-641-6935',
    faxForeignFromUS: '855-215-1627',
    faxForeignFromAbroad: '304-707-9471',
    mailInland: 'Internal Revenue Service, Attn: EIN Operation, Cincinnati, OH 45999',
    mailForeign: 'Internal Revenue Service, Attn: EIN International Operation, Cincinnati, OH 45999',
  },
  // Line structure, in printed order. `kind` drives the control the renderer draws.
  lines: [
    { id: '1', label: 'Legal name of entity (or individual) for whom the EIN is being requested', kind: 'text', span: 2 },
    { id: '2', label: 'Trade name of business (if different from name on line 1)', kind: 'text', span: 2 },
    { id: '3', label: "Executor, administrator, trustee, \u201ccare of\u201d name", kind: 'text', span: 2 },
    { id: '4a', label: 'Mailing address (room, apt., suite no. and street, or P.O. box)', kind: 'text', span: 2 },
    { id: '4b', label: 'City, state, and ZIP code (if foreign, see instructions)', kind: 'text', span: 2 },
    { id: '5a', label: "Street address (if different) (Don't enter a P.O. box.)", kind: 'text', span: 2 },
    { id: '5b', label: 'City, state, and ZIP code (if foreign, see instructions)', kind: 'text', span: 2 },
    { id: '6', label: 'County and state where principal business is located', kind: 'text', span: 2 },
    { id: '7a', label: 'Name of responsible party', kind: 'text', span: 2 },
    { id: '7b', label: 'SSN, ITIN, or EIN', kind: 'text', span: 1 },
    { id: '8a', label: 'Is this application for a limited liability company (LLC) (or a foreign equivalent)?', kind: 'yesno', span: 2 },
    { id: '8b', label: "If 8a is \u201cYes,\u201d enter the number of LLC members", kind: 'text', span: 1 },
    { id: '8c', label: "If 8a is \u201cYes,\u201d was the LLC organized in the United States?", kind: 'yesno', span: 2 },
    { id: '9a', label: 'Type of entity (check only one box)', kind: 'checkboxGroup', span: 2 },
    { id: '9b', label: 'If a corporation, name the state or foreign country (if applicable) where incorporated', kind: 'text', span: 2 },
    { id: '10', label: 'Reason for applying (check only one box)', kind: 'checkboxGroup', span: 2 },
    { id: '11', label: 'Date business started or acquired (month, day, year)', kind: 'date', span: 1 },
    { id: '12', label: 'Closing month of accounting year', kind: 'text', span: 1 },
    {
      id: '13',
      label: 'Highest number of employees expected in the next 12 months (enter -0- if none). If no employees expected, complete lines 14 and 16.',
      kind: 'employees',
      span: 2,
    },
    { id: '14', label: 'Do you want to file Form 944?', kind: 'yesno', span: 2 },
    { id: '15', label: 'First date wages or annuities were paid (month, day, year)', kind: 'date', span: 1 },
    { id: '16', label: 'Check one box that best describes the principal activity of your business', kind: 'checkboxGroup', span: 2 },
    { id: '17', label: 'Indicate principal line of merchandise sold, specific construction work done, products produced, or services provided', kind: 'text', span: 2 },
    { id: '18', label: 'Has the applicant entity shown on line 1 ever applied for and received an EIN?', kind: 'yesnoEIN', span: 2 },
  ],
  // Line 9a boxes, in printed order.
  entityTypes: [
    'Sole proprietor',
    'Partnership',
    'Corporation (specify)',
    'Personal service corporation',
    'Church or church-controlled organization',
    'Other nonprofit organization (specify)',
    'Other (specify)',
    'Estate (specify)',
    'Plan administrator',
    'Trust (specify)',
    'Government (specify)',
    'Indian tribal government/enterprise',
  ],
  // Line 10 boxes, in printed order.
  reasons: [
    'Started a new business (specify type)',
    'Hired employees (check the box and see line 13)',
    'Banking purpose (specify purpose)',
    'Changed type of organization (specify new type)',
    'Purchased going business (specify date acquired)',
    'Created a trust (specify type)',
    'Created a pension plan (specify type)',
    'Other (specify)',
  ],
  // Line 16 boxes, in printed order.
  activities: [
    'Construction',
    'Real estate',
    'Rental & leasing',
    'Manufacturing',
    'Transportation & warehousing',
    'Finance & insurance',
    'Health care & social assistance',
    'Accommodation & food services',
    'Wholesale — agent/broker',
    'Wholesale — other',
    'Retail',
    'Other',
  ],
  employeeColumns: ['Agricultural', 'Household', 'Other'],
  // Third Party Designee block, printed below the line area.
  designee: {
    intro: 'If you want to allow a third party to receive the EIN and answer questions about this application, complete the following. The designee\u2019s authority ends when the EIN is assigned.',
    fields: [
      'Name of third party designee',
      'Telephone number',
      'Address and ZIP code',
      'Fax number',
    ],
  },
  declaration:
    'Under penalties of perjury, I declare that I have examined this application, and to the best of my knowledge and belief, it is true, correct, and complete. I authorize the IRS to provide the third party designee named above with the EIN and to answer questions about this application.',
  signatureFields: ["Name and title (type or print clearly)", "Applicant's signature", 'Date', "Applicant's telephone number", "Applicant's fax number"],
  // The certificate on a LLC line 8c is a trap for foreign organizers.
  notes: [
    'Line 6 asks for the county, not just the state — banks and the IRS both match on it.',
    'Line 7b is required. Without an SSN, ITIN or EIN you cannot use the online assistant and must file by fax or post.',
    'An entity applying on line 1 must be a legal entity. A business name that has not been filed yet cannot apply.',
    'Line 18 matters after a reorganisation: applying twice for the same entity creates reconciliation work later.',
  ],
};

// --- State / DC formation filings -------------------------------------------
//
// `printable` = the jurisdiction publishes an official formation form we can
// render as a replica. When false, the renderer emits the document the state
// requires and says so plainly.
//
// `feeVerified` flags figures the research could not read directly off the
// official schedule; those render with an explicit confirm-before-filing note.

const X = true; // fee read from an official schedule
const U = false; // fee needs confirmation on the official page

export const STATE_FILINGS = {
  AL: {
    name: 'Alabama', agency: 'Secretary of State, Business Entities Division',
    corp: { number: null, title: 'Domestic Business Corporation Certificate of Formation', printable: true },
    llc: { number: null, title: 'Domestic Limited Liability Company Certificate of Formation', printable: true },
    fee: { corp: 200, llc: 200 }, feeVerified: X,
    portal: 'https://www.sos.alabama.gov/business-services',
  },
  AK: {
    name: 'Alaska', agency: 'Division of Corporations, Business and Professional Licensing',
    corp: { number: '08-539', title: 'Articles of Incorporation', printable: true },
    llc: { number: '08-0484', title: 'Articles of Organization', printable: true },
    fee: { corp: 50, llc: 250 }, feeVerified: X,
    portal: 'https://www.commerce.alaska.gov/web/cbpl/Corporations/OnlineFilingInstructionsLLCArticles.aspx',
  },
  AZ: {
    name: 'Arizona', agency: 'Corporation Commission',
    corp: { number: 'C010', title: 'Articles of Incorporation (For-Profit)', printable: true },
    llc: { number: 'L010', title: 'Articles of Organization', printable: true },
    fee: { corp: 60, llc: 50 }, feeVerified: U,
    portal: 'https://ecorp.azcc.gov/',
  },
  AR: {
    name: 'Arkansas', agency: 'Secretary of State, Business and Commercial Services',
    corp: { number: 'DN-01', title: 'Articles of Incorporation', printable: true },
    llc: { number: 'LL-01', title: 'Certificate of Organization', printable: true },
    fee: { corp: 45, llc: 45 }, feeVerified: X,
    feeNote: '$45 online, $50 by paper, per entity.',
    portal: 'https://www.sos.arkansas.gov/business-commercial-services-bcs',
  },
  CA: {
    name: 'California', agency: 'Secretary of State, Business Programs Division',
    corp: { number: 'ARTS-GS', title: 'Articles of Incorporation — General Stock Corporation', printable: true },
    llc: { number: 'LLC-1', title: 'Articles of Organization', printable: true },
    fee: { corp: 100, llc: 70 }, feeVerified: X,
    portal: 'https://bizfileonline.sos.ca.gov/',
    address: 'Secretary of State, Business Programs Division, P.O. Box 944260, Sacramento, CA 94244-2600',
    note: 'The $800 annual minimum franchise tax begins in the first year, regardless of profit.',
  },
  CO: {
    name: 'Colorado', agency: 'Secretary of State, Business Division',
    corp: { number: null, title: 'Articles of Incorporation — Profit Corporation', printable: false },
    llc: { number: null, title: 'Articles of Organization', printable: false },
    fee: { corp: 50, llc: 50 }, feeVerified: X,
    portal: 'https://www.sos.state.co.us/biz/FileDoc.do',
    note: 'Colorado does not publish a paper formation form. Filing is completed in the Secretary of State online system, which is the authority for the layout — the replica below is the statutory document built to that system\u2019s required statements.',
  },
  CT: {
    name: 'Connecticut', agency: 'Secretary of the State, Business Services',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Certificate of Organization', printable: true },
    fee: { corp: 250, llc: 120 }, feeVerified: U,
    portal: 'https://business.ct.gov/',
  },
  DE: {
    name: 'Delaware', agency: 'Division of Corporations, Department of State',
    corp: { number: null, title: 'Certificate of Incorporation', printable: false },
    llc: { number: null, title: 'Certificate of Formation', printable: false },
    fee: { corp: 109, llc: 110 }, feeVerified: U,
    feeNote: 'Corporation fee depends on authorized shares; the Division fee schedule lists a minimum. LLC fee is $110.',
    portal: 'https://corp.delaware.gov/howtoform/',
    address: 'Division of Corporations, John G. Townsend Building, 401 Federal Street, Suite 4, Dover, DE 19901',
    note: 'Delaware publishes fillable SAMPLE certificates but no numbered formation form — the incorporator drafts and files the certificate. A cover memo is required when filing by post.',
  },
  DC: {
    name: 'District of Columbia', agency: 'Dept. of Licensing and Consumer Protection, Corporations Division',
    corp: { number: 'DBU-1', title: 'Articles of Incorporation of Domestic Business Corporation', printable: true },
    llc: { number: 'DLC-1', title: 'Articles of Organization for Domestic Limited Liability Company', printable: true },
    fee: { corp: 220, llc: 99 }, feeVerified: U,
    portal: 'https://corponline.dlcp.dc.gov/',
  },
  FL: {
    name: 'Florida', agency: 'Department of State, Division of Corporations (Sunbiz)',
    corp: { number: null, title: 'Profit Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 70, llc: 125 }, feeVerified: X,
    feeNote: 'Includes the registered-agent designation fee ($35 for a corporation, $25 for an LLC).',
    portal: 'https://dos.fl.gov/sunbiz/start-business/efile/',
    note: 'The registered agent must sign and accept the designation, so this filing cannot be submitted without the agent\u2019s signature.',
  },
  GA: {
    name: 'Georgia', agency: 'Secretary of State, Corporations Division',
    corp: { number: null, title: 'Articles of Incorporation (paper filing requires form CD 227, Transmittal Form — Corporation)', printable: false },
    llc: { number: 'CD 030', title: 'Articles of Organization for LLC (paper filing requires form CD 231, Transmittal Form — LLC)', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: X,
    feeNote: '$100 online; $110 by paper, which includes the paper service charge.',
    portal: 'https://ecorp.sos.ga.gov/',
    address: 'Corporations Division, 2 Martin Luther King Jr. Drive SE, Suite 313 West Tower, Atlanta, GA 30334',
    note: 'Georgia publishes no numbered articles form for corporations — the articles are drafted. A CD 227 transmittal accompanies a paper filing.',
  },
  HI: {
    name: 'Hawaii', agency: 'Business Registration Division, Dept. of Commerce and Consumer Affairs',
    corp: { number: 'DC-1', title: 'Articles of Incorporation', printable: true },
    llc: { number: 'LLC-1', title: 'Articles of Organization for Limited Liability Company', printable: true },
    fee: { corp: 51, llc: 51 }, feeVerified: X,
    feeNote: '$50 filing fee plus a $1 archive fee.',
    portal: 'https://hbe.ehawaii.gov/BizEx/home.eb',
  },
  ID: {
    name: 'Idaho', agency: 'Secretary of State',
    corp: { number: null, title: 'Articles of Incorporation — General Business', printable: true },
    llc: { number: null, title: 'Certificate of Organization — Limited Liability Company', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: X,
    feeNote: '$100 online; paper adds a $20 manual-processing fee.',
    portal: 'https://sosbiz.idaho.gov/',
  },
  IL: {
    name: 'Illinois', agency: 'Secretary of State, Department of Business Services',
    corp: { number: 'BCA 2.10', title: 'Articles of Incorporation', printable: true },
    llc: { number: 'LLC-5.5', title: 'Articles of Organization', printable: true },
    fee: { corp: 150, llc: 150 }, feeVerified: X,
    feeNote: 'Corporation total can exceed $150 once the franchise-tax calculation applies.',
    portal: 'https://www.ilsos.gov/departments/business-services/incorporation.html',
  },
  IN: {
    name: 'Indiana', agency: 'Secretary of State, Business Services Division',
    corp: { number: '4159', title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 90, llc: 95 }, feeVerified: U,
    portal: 'https://inbiz.in.gov/',
  },
  IA: {
    name: 'Iowa', agency: 'Secretary of State',
    corp: { number: null, title: 'Articles of Incorporation — Profit', printable: false },
    llc: { number: null, title: 'Certificate of Organization', printable: false },
    fee: { corp: 50, llc: 50 }, feeVerified: U,
    portal: 'https://filings.sos.iowa.gov/',
    note: 'Iowa does not publish a standard fillable formation form — documents are submitted through Fast Track Filing.',
  },
  KS: {
    name: 'Kansas', agency: 'Secretary of State',
    corp: { number: 'AI', title: 'Articles of Incorporation — General Corporation', printable: true },
    llc: { number: 'DL', title: 'Articles of Organization — General LLC', printable: true },
    fee: { corp: 90, llc: 75 }, feeVerified: U,
    portal: 'https://sos.ks.gov/businesses/register-a-business.html',
  },
  KY: {
    name: 'Kentucky', agency: 'Secretary of State, Business Filings',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: 'KLC', title: 'Articles of Organization — Profit Limited Liability Company', printable: true },
    fee: { corp: 40, llc: 40 }, feeVerified: U,
    portal: 'https://sos.ky.gov/bus/business-filings/OnlineServices/',
  },
  LA: {
    name: 'Louisiana', agency: 'Secretary of State, Commercial Division',
    corp: { number: '399', title: 'Articles of Incorporation — Louisiana Business Corporation', printable: true },
    llc: { number: null, title: 'Articles of Organization — Louisiana Limited Liability Company', printable: true },
    fee: { corp: 95, llc: 100 }, feeVerified: U,
    portal: 'https://www.sos.la.gov/business-services/file-business-documents',
  },
  ME: {
    name: 'Maine', agency: 'Secretary of State, Bureau of Corporations, Elections and Commissions',
    corp: { number: null, title: 'Articles of Incorporation (business corporation)', printable: true },
    llc: { number: 'MLLC-6', title: 'Certificate of Formation', printable: true },
    fee: { corp: 145, llc: 175 }, feeVerified: U,
    portal: 'https://apps3.web.maine.gov/nei-sos-icrs/ICRS',
  },
  MD: {
    name: 'Maryland', agency: 'Department of Assessments and Taxation',
    corp: { number: null, title: 'Articles of Incorporation (stock corporation)', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: U,
    feeNote: 'A corporation also pays organization and capitalization charges, which vary with authorized capital.',
    portal: 'https://businessexpress.maryland.gov/',
  },
  MA: {
    name: 'Massachusetts', agency: 'Secretary of the Commonwealth, Corporations Division',
    corp: { number: null, title: 'Articles of Organization (for-profit corporation)', printable: true },
    llc: { number: null, title: 'Limited Liability Company Certificate of Organization', printable: true },
    fee: { corp: 275, llc: 500 }, feeVerified: U,
    feeNote: 'Corporation fee rises with authorized shares above the statutory threshold.',
    portal: 'https://www.sec.state.ma.us/divisions/corporations/corporations.htm',
  },
  MI: {
    name: 'Michigan', agency: 'Dept. of Licensing and Regulatory Affairs, Corporations Division',
    corp: { number: '500', title: 'Articles of Incorporation — For Profit', printable: true },
    llc: { number: '700', title: 'Articles of Organization', printable: true },
    fee: { corp: 60, llc: 50 }, feeVerified: U,
    feeNote: 'Corporation fee depends on share structure.',
    portal: 'https://mibusinessregistry.lara.state.mi.us/',
  },
  MN: {
    name: 'Minnesota', agency: 'Secretary of State, Business Services',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 155, llc: 155 }, feeVerified: X,
    feeNote: '$155 filed online or in person; $135 by mail.',
    portal: 'https://mblsportal.sos.mn.gov/',
  },
  MS: {
    name: 'Mississippi', agency: 'Secretary of State, Business Services',
    corp: { number: 'F0001', title: 'Articles of Incorporation', printable: true },
    llc: { number: 'F0100', title: 'Certificate of Formation', printable: true },
    fee: { corp: 50, llc: 50 }, feeVerified: U,
    portal: 'https://corp.sos.ms.gov/corp/',
  },
  MO: {
    name: 'Missouri', agency: 'Secretary of State, Corporations Division',
    corp: { number: 'Corp. 41', title: 'Articles of Incorporation of a For Profit Corporation', printable: true },
    llc: { number: 'LLC 1', title: 'Articles of Organization for a Limited Liability Company', printable: true },
    fee: { corp: 58, llc: 50 }, feeVerified: U,
    feeNote: 'Corporation fee is share-based with a minimum; LLC is $50 online or $105 by paper.',
    portal: 'https://bsd.sos.mo.gov/',
  },
  MT: {
    name: 'Montana', agency: 'Secretary of State, Business Services',
    corp: { number: null, title: 'Articles of Incorporation — Profit Corporation', printable: false },
    llc: { number: null, title: 'Articles of Organization for Domestic Limited Liability Company', printable: false },
    fee: { corp: 35, llc: 35 }, feeVerified: X,
    portal: 'https://biz.sosmt.gov/',
    note: 'Montana accepts formation filings online only and does not publish a paper form.',
  },
  NE: {
    name: 'Nebraska', agency: 'Secretary of State, Business Services',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Certificate of Organization', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: X,
    feeNote: '$100 filed online; $110 in office.',
    portal: 'https://www.nebraska.gov/apps-sos-edocs/',
  },
  NV: {
    name: 'Nevada', agency: 'Secretary of State, Commercial Recordings Division',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 425, llc: 425 }, feeVerified: U,
    feeNote: 'The formation package also includes the initial list of officers and the state business license, which is why the total is high.',
    portal: 'https://www.nvsilverflume.gov/',
  },
  NH: {
    name: 'New Hampshire', agency: 'Secretary of State, Corporation Division',
    corp: { number: 'Form 11', title: 'Articles of Incorporation', printable: true },
    llc: { number: 'Form LLC-1', title: 'Certificate of Formation', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: U,
    portal: 'https://quickstart.sos.nh.gov/',
  },
  NJ: {
    name: 'New Jersey', agency: 'Division of Revenue and Enterprise Services, Dept. of the Treasury',
    corp: { number: null, title: 'Certificate of Incorporation', printable: false },
    llc: { number: null, title: 'Certificate of Formation', printable: false },
    fee: { corp: 125, llc: 125 }, feeVerified: U,
    portal: 'https://www.njportal.com/DOR/BusinessFormation/Home/Welcome',
    note: 'New Jersey files formation certificates through the state portal; there is no downloadable paper formation form.',
  },
  NM: {
    name: 'New Mexico', agency: 'Secretary of State, Business Services',
    corp: { number: null, title: 'Articles of Incorporation — Domestic Profit Corporation', printable: false },
    llc: { number: null, title: 'Articles of Organization — Domestic Limited Liability Company', printable: false },
    fee: { corp: 100, llc: 50 }, feeVerified: U,
    portal: 'https://enterprise.sos.nm.gov/',
    note: 'New Mexico provides the formation form in its online business portal rather than as a paper document.',
  },
  NY: {
    name: 'New York', agency: 'Department of State, Division of Corporations',
    corp: { number: 'DOS-1239-f', title: 'Certificate of Incorporation for a Domestic Business Corporation', printable: true },
    llc: { number: 'DOS-1336-f', title: 'Articles of Organization for a Domestic Limited Liability Company', printable: true },
    fee: { corp: 125, llc: 200 }, feeVerified: X,
    portal: 'https://dos.ny.gov/corporation-and-business-entity-filings',
    address: 'NYS Department of State, Division of Corporations, One Commerce Plaza, 99 Washington Avenue, Albany, NY 12231',
    note: 'The Secretary of State is the statutory agent for service of process, so no separate registered-agent consent is filed. An LLC must also publish its formation in two newspapers after approval — a real cost people forget.',
  },
  NC: {
    name: 'North Carolina', agency: 'Secretary of State, Business Registration Division',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 125, llc: 125 }, feeVerified: U,
    portal: 'https://www.sosnc.gov/online_services',
  },
  ND: {
    name: 'North Dakota', agency: 'Secretary of State, Business Information',
    corp: { number: null, title: 'Business Corporation Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 100, llc: 135 }, feeVerified: U,
    portal: 'https://firststop.sos.nd.gov/',
  },
  OH: {
    name: 'Ohio', agency: 'Secretary of State, Business Filings',
    corp: { number: '532A', title: 'Initial Articles of Incorporation', printable: true },
    llc: { number: '610', title: 'Articles of Organization', printable: true },
    fee: { corp: 99, llc: 99 }, feeVerified: X,
    portal: 'https://bsportal.ohiosos.gov/',
  },
  OK: {
    name: 'Oklahoma', agency: 'Secretary of State, Business Filing Department',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 50, llc: 100 }, feeVerified: U,
    portal: 'https://www.sos.ok.gov/business/',
  },
  OR: {
    name: 'Oregon', agency: 'Secretary of State, Corporation Division',
    corp: { number: null, title: 'Articles of Incorporation — Business/Professional Corporation', printable: true },
    llc: { number: null, title: 'Articles of Organization — Limited Liability Company', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: X,
    portal: 'https://secure.sos.state.or.us/cbrmanager/',
  },
  PA: {
    name: 'Pennsylvania', agency: 'Department of State, Bureau of Corporations and Charitable Organizations',
    corp: { number: 'DSCB:15-1306', title: 'Articles of Incorporation — Business Corporation', printable: true },
    llc: { number: 'DSCB:15-8913', title: 'Certificate of Organization — Domestic LLC', printable: true },
    fee: { corp: 125, llc: 125 }, feeVerified: U,
    portal: 'https://file.dos.pa.gov/',
  },
  RI: {
    name: 'Rhode Island', agency: 'Department of State, Business Services Division',
    corp: { number: 'Form 100', title: 'Articles of Incorporation', printable: true },
    llc: { number: 'Form 400', title: 'Articles of Organization', printable: true },
    fee: { corp: 230, llc: 150 }, feeVerified: U,
    portal: 'https://business.sos.ri.gov/',
  },
  SC: {
    name: 'South Carolina', agency: 'Secretary of State, Business Filings',
    corp: { number: null, title: 'Articles of Incorporation (CL-1 tax form also required)', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 135, llc: 110 }, feeVerified: U,
    feeNote: 'The corporation fee includes the CL-1 initial report.',
    portal: 'https://businessfilings.sc.gov/',
  },
  SD: {
    name: 'South Dakota', agency: 'Secretary of State, Business Services',
    corp: { number: null, title: 'Articles of Incorporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 150, llc: 150 }, feeVerified: X,
    feeNote: '$150 online; $165 by paper.',
    portal: 'https://sosenterprise.sd.gov/BusinessServices/',
  },
  TN: {
    name: 'Tennessee', agency: 'Secretary of State, Business Services',
    corp: { number: 'SS-4417', title: 'Charter — For-Profit Corporation', printable: true },
    llc: { number: 'SS-4270', title: 'Articles of Organization', printable: true },
    fee: { corp: 100, llc: 300 }, feeVerified: U,
    feeNote: 'Tennessee LLC fee is $50 per member with a $300 minimum and a $3,000 maximum.',
    portal: 'https://tncab.tnsos.gov/',
  },
  TX: {
    name: 'Texas', agency: 'Secretary of State, Business Organizations Section',
    corp: { number: '201', title: 'Certificate of Formation for a For-Profit Corporation', printable: true },
    llc: { number: '205', title: 'Certificate of Formation for a Limited Liability Company', printable: true },
    fee: { corp: 300, llc: 300 }, feeVerified: X,
    portal: 'https://www.sos.state.tx.us/corp/options.shtml',
    note: 'The registered agent must consent in writing; the consent is retained by the entity rather than filed. Texas form 401-A documents it.',
  },
  UT: {
    name: 'Utah', agency: 'Division of Corporations and Commercial Code, Dept. of Commerce',
    corp: { number: null, title: 'Articles of Incorporation', printable: false },
    llc: { number: null, title: 'Certificate of Organization', printable: false },
    fee: { corp: 70, llc: 54 }, feeVerified: U,
    portal: 'https://businessregistration.utah.gov/',
    note: 'Utah takes formation filings through its online business registration system.',
  },
  VT: {
    name: 'Vermont', agency: 'Secretary of State, Corporations Division',
    corp: { number: null, title: 'Articles of Incorporation', printable: false },
    llc: { number: null, title: 'Articles of Organization', printable: false },
    fee: { corp: 125, llc: 155 }, feeVerified: U,
    portal: 'https://bizfilings.vermont.gov/online/',
    note: 'Vermont files formations through the Online Business Service Center.',
  },
  VA: {
    name: 'Virginia', agency: 'State Corporation Commission, Clerk\u2019s Office',
    corp: { number: 'SCC619', title: 'Articles of Incorporation — Stock Corporation', printable: true },
    llc: { number: 'LLC1011', title: 'Articles of Organization', printable: true },
    fee: { corp: 75, llc: 100 }, feeVerified: U,
    feeNote: 'Corporation fee varies with authorized shares above the minimum.',
    portal: 'https://cis.scc.virginia.gov/',
  },
  WA: {
    name: 'Washington', agency: 'Secretary of State, Corporations and Charities Division',
    corp: { number: null, title: 'Articles of Incorporation — Profit Corporation', printable: true },
    llc: { number: null, title: 'Certificate of Formation — Limited Liability Company', printable: true },
    fee: { corp: 180, llc: 180 }, feeVerified: X,
    feeNote: '$180 by paper; online filing adds a processing fee.',
    portal: 'https://www.sos.wa.gov/corporations-charities/business-entities/filings-forms-information',
  },
  WV: {
    name: 'West Virginia', agency: 'Secretary of State, Business and Licensing',
    corp: { number: null, title: 'Articles of Incorporation (profit corporation)', printable: true },
    llc: { number: 'LLD-1', title: 'Articles of Organization', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: U,
    portal: 'https://business4.wv.gov/',
  },
  WI: {
    name: 'Wisconsin', agency: 'Department of Financial Institutions, Corporate Records',
    corp: { number: 'Form 2', title: 'Articles of Incorporation — Business Corporation', printable: true },
    llc: { number: 'Form 502', title: 'Articles of Organization — Limited Liability Company', printable: true },
    fee: { corp: 100, llc: 130 }, feeVerified: U,
    feeNote: 'LLC fee is about $130 online or $170 by paper.',
    portal: 'https://onestop.wi.gov/',
  },
  WY: {
    name: 'Wyoming', agency: 'Secretary of State, Business Division',
    corp: { number: null, title: 'Articles of Incorporation — Profit Corporation', printable: true },
    llc: { number: null, title: 'Articles of Organization', printable: true },
    fee: { corp: 100, llc: 100 }, feeVerified: U,
    portal: 'https://wyobiz.wyo.gov/Business/',
  },
};

export const STATE_CODES = Object.keys(STATE_FILINGS);

/** Look up a jurisdiction, tolerating a full state name or a stray case. */
export function stateFiling(input, fallback = 'DE') {
  const code = String(input || '').trim().toUpperCase();
  if (STATE_FILINGS[code]) return { code, ...STATE_FILINGS[code] };
  const match = Object.entries(STATE_FILINGS).find(([, value]) => value.name.toUpperCase() === code);
  if (match) return { code: match[0], ...match[1] };
  return { code: fallback, ...STATE_FILINGS[fallback] };
}
