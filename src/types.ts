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
}

export interface ClientRecord extends KYCAnalysisResult {
  id: string;
  analyzedAt: string;
  transcriptSample: string;
}
