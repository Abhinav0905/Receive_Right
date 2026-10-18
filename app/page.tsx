import { getChatGPTUser } from "./chatgpt-auth";
import ReceivingWorkspace from "./receiving-workspace";
import SignInRequired from "./sign-in-required";

// Evaluate each visitor's identity per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return user ? <ReceivingWorkspace /> : <SignInRequired />;
}
