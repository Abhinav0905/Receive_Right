import { ArrowRight, PackageCheck, ShieldCheck } from "lucide-react";

export default function SignInRequired({ expired = false }: { expired?: boolean }) {
  return <main className="sign-in-page"><section className="sign-in-card">
    <span className="brand-mark"><PackageCheck size={30} strokeWidth={1.6} /></span>
    <p className="eyebrow">RECEIVERIGHT · YOUR PRIVATE WORKSPACE</p>
    <h1>{expired ? "Let's get you signed back in." : "Every delivery, accounted for."}</h1>
    <p className="sign-in-description">{expired ? "Your session has expired or wasn't available to the app. Sign in again to return to your saved orders and receipts." : "Sign in with the ChatGPT account that has access to ReceiveRight. Your orders, photos and receipts stay in your private workspace."}</p>
    <a className="button primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT<ArrowRight size={18} /></a>
    <p className="sign-in-help"><ShieldCheck size={15} />Opens the secure sign-in page, then brings you back here.</p>
  </section></main>;
}
