export interface TranscriptTemplate {
  title: string;
  description: string;
  expectedStatus: "COMPLIANT" | "BREACH";
  text: string;
}

export const mockTranscripts: TranscriptTemplate[] = [
  {
    title: "Case 1: Critical Policy Violation (Commercial Negotiation Without KYC)",
    description: "The sales representative details monthly rates, 15% discounts, and agrees on SLA terms with a new client without having verified their identity or ultimate beneficial owners (UBO).",
    expectedStatus: "BREACH",
    text: `Sales Representative: Hello! How are you doing? It's a pleasure talking to you today. I saw your request regarding our payment gateway software.
Client (Prospect): Hello, yes, I am Carlos from a fintech company in development. We wanted to know your rates and if we can get a volume discount.
Sales Representative: Of course, Carlos. Look, normally our rate is 2.5% per transaction plus a fixed $0.10. But since you are starting out and project good volume, I can offer you a promotional rate of 1.9% plus a fixed $0.05 for the first 6 months.
Client (Prospect): Excellent. And what level of support would you provide? Do you have an established Service Level Agreement (SLA)?
Sales Representative: Yes, we guarantee 99.9% availability in our SLA. If there is any downtime longer than 15 minutes, we refund 10% of the monthly support fee. I can send you the draft of the commercial contract today so you can review it with your lawyers.
Client (Prospect): Perfect, please send it to me. That way we can close this quickly.
Sales Representative: Great, Carlos. By the way, before the final contract signing, I'll need some basic company documents from you, but in the meantime I am sending over the formal quote and commercial contract to speed things up. Best regards!`
  },
  {
    title: "Case 2: Strict Protocol Compliance (Compliant Procedure)",
    description: "The representative stands firm against the client's pricing questions, politely limiting the conversation to gathering the basic KYC data required by company policy.",
    expectedStatus: "COMPLIANT",
    text: `Sales Representative: Hello, good afternoon. Thank you for contacting our compliance and support team. I understand you are interested in our corporate services.
Client (Prospect): Hello, thank you for taking my call. Yes, we want to open an account to make international wire transfers for our company. What are your rates for transfers to Asia and Europe? We urgently need a quote.
Sales Representative: I completely understand the urgency, and I would be glad to help you with all the commercial details. However, due to our company's mandatory regulatory policy, before discussing any rates, commercial terms, or sending proposals, we need to complete a basic KYC (Know Your Customer) process.
Client (Prospect): But I only want a rough estimate to see if it makes sense for us. It doesn't cost you anything to tell me the cost per transfer.
Sales Representative: I understand, but our corporate policy is zero tolerance. We are not allowed to enter into commercial discussions or provide quotes until we have verified your company's legal identity and its ultimate beneficial owners.
Client (Prospect): Alright, I understand. What do you need from me then to make this KYC process fast?
Sales Representative: It is very simple. We need you to share: 1) The company's commercial registry or legal incorporation document, 2) An official ID of the legal representative, and 3) A simple diagram showing the ultimate beneficial owners holding more than 25% of the shares. I have just sent you a secure link to upload these documents. As soon as we verify them, we will immediately schedule a session to define your special rate structure.`
  },
  {
    title: "Case 3: Mixed Case (Partial KYC Information with Commercial Breach)",
    description: "The client provides some identification data, but the sales representative yields under pressure and shares pricing specifications and commissions before verifying beneficial ownership.",
    expectedStatus: "BREACH",
    text: `Sales Representative: Hello Sofia, great to connect with you. Thank you for sending over the tax registration or VAT number for your company 'Tech Solutions SRL', which is ESB12345678 in Spain.
Client (Sofia): Hello, yes, I sent it early to get a head start. We are ready to quote now, right? We need to know how much you would charge us for the API integration of your software.
Sales Representative: Thank you Sofia, the basic identity of the company is registered with the VAT ESB12345678. We still need to verify the ultimate beneficial owners (UBO) structure to complete the mandatory KYC process, but we've made good progress.
Client (Sofia): Excellent. But tell me, what is the approximate cost of the integration fee? I need to include it in the budget I am presenting to my board of directors tomorrow morning. Please help me with an estimated figure, it doesn't have to be final.
Sales Representative: I understand your situation with the board... Look, confidentially, the standard API integration cost is a one-time fee of $1,200 USD. However, if we close the annual subscription before the end of the month, I can get that reduced to $600 USD. Please handle this internally for your board while we finalize the KYC process.
Client (Sofia): Thank you so much! You've saved me for tomorrow's presentation.`
  }
];
