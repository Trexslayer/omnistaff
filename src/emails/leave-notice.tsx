import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
export function LeaveNoticeEmail({ message }: { message: string }) {
  return <Html><Head /><Preview>OmniStaff leave update</Preview><Body style={{ backgroundColor: "#f6f7f9", fontFamily: "Arial, sans-serif" }}><Container style={{ margin: "32px auto", padding: 24, backgroundColor: "#ffffff", borderRadius: 12 }}><Section><Heading style={{ fontSize: 22 }}>OmniStaff</Heading><Text style={{ fontSize: 15, lineHeight: "24px" }}>{message}</Text><Text style={{ color: "#666", fontSize: 12 }}>This is an automated notification.</Text></Section></Container></Body></Html>;
}
