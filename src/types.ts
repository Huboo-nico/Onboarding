export interface KYCDetails {
  identityEstablished: boolean;
  ownershipVerified: boolean;
  businessActivityDefined: boolean;
  riskAssessmentCompleted: boolean;
}

export interface KYCAnalysisResult {
  clientName: string;
  companyName: string;
  role: string;
  country: string;
  contactInfo: string;
  kycChecklist: KYCDetails;
  commercialDiscussionsDetected: boolean;
  commercialDetailsFound: string;
  isCompliant: boolean;
  breachSeverity: 'NONE' | 'CRITICAL';
  summaryOfCall: string;
  nextStepsRequired: string[];
  taxId?: string;
  taxIdResearch?: string;
  questionnaire?: {
    q1_name: string;
    q2_source: string;
    q3_country: string;
    q4_address_phone: string;
    q5_company_name: string;
    q6_activity: string;
    q7_statutory_db: string;
    q8_formation_date: string;
    q9_years_trading: string;
    q10_shipping: string;
    q11_channel: string;
    q12_goods_in: string;
    q13_stock_shipping: string;
    q14_average_rrp: string;
    q15_start_date: string;
    q16_kyc: string;
    q17_capital: string;
    q18_europe: string;
    q19_pricing: string;
    q20_other: string;
  };
}

export interface ClientRecord extends KYCAnalysisResult {
  id: string;
  analyzedAt: string;
  transcriptSample: string;
}
