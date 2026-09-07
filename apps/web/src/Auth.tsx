import { ClerkProvider, SignIn, SignUp, UserButton, useAuth } from "@clerk/react";
import { itIT } from "@clerk/localizations";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import "./auth.css";

type Profile = { userId: string; name: string; firstName: string; lastName: string; jobTitle: string | null; email: string; role: "admin" | "operator"; automation: boolean; welcomeSeenAt: string | null };
const IdentityContext = createContext<{ profile: Profile; markWelcomeSeen: () => Promise<void> } | null>(null);
export function useIdentity() {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error("Profilo autenticato richiesto");
  return identity;
}

export function CurrentOperator() {
  const { profile } = useIdentity();
  const accessRole = profile.role === "admin" ? "Amministratore" : "Operatore";
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.name;
  return <div className="operator-card" aria-label="Operatore corrente" title={[fullName, profile.jobTitle, `Accesso ${accessRole.toLowerCase()}`].filter(Boolean).join(" · ")}>
    <UserButton /><div>
      <strong className="operator-name">{fullName}</strong>
      {profile.jobTitle && <span className="operator-job-title">{profile.jobTitle}</span>}
      <span className="operator-access-role">{profile.jobTitle ? "Accesso " : ""}{accessRole}{profile.automation ? " · Test" : ""}</span>
    </div>
  </div>;
}

function AccessPage({ children }: { children: ReactNode }) {
  return <main className="pq-access"><section className="pq-access-brand">
    <span className="pq-access-eyebrow">SOUL · PROSPECT QUALIFIER</span>
    <h1>Il tuo spazio.<br />Il valore di ogni immobile.</h1>
    <p>Studi, planimetrie e presentazioni, in un unico ambiente di lavoro riservato al team.</p>
    {import.meta.env.VITE_APP_ENV === "staging" && <span className="pq-access-stage">Ambiente di staging · Test e verifiche</span>}
  </section><section className="pq-access-form" aria-label="Accesso a PQ">{children}</section></main>;
}

export function Authentication({ children }: { children: ReactNode }) {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
  const environment = import.meta.env.VITE_APP_ENV;
  const expectedPrefix = environment === "production" ? "pk_live_" : "pk_test_";
  if (!key?.startsWith(expectedPrefix) || !["staging", "production"].includes(environment)) {
    return <AccessPage><h2>Stiamo preparando il tuo accesso.</h2><p>La configurazione dell’accesso sicuro è in corso. Contatta l’amministratore per maggiori informazioni.</p></AccessPage>;
  }
  return <ClerkProvider publishableKey={key} localization={itIT} signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/"
    appearance={{ variables: { colorPrimary: "#006B94", borderRadius: "12px" } }}>
    <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
  </ClerkProvider>;
}

function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setProfile(null); setError("");
    if (!isLoaded || !isSignedIn) return;
    const abort = new AbortController();
    fetch("/api/auth/me", { credentials: "same-origin", signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403
          ? "Il tuo account non è ancora abilitato a PQ. Chiedi l’accesso all’amministratore."
          : response.status === 401 ? "La sessione non è valida. Esci e accedi nuovamente."
            : "Non riusciamo a verificare l’accesso. Riprova tra poco.");
        return response.json() as Promise<Profile>;
      }).then(setProfile).catch((reason: Error) => { if (!abort.signal.aborted) setError(reason.message); });
    return () => abort.abort();
  }, [isLoaded, isSignedIn, userId, retry]);

  if (!isLoaded) return <AccessPage><p role="status">Preparazione dell’accesso…</p></AccessPage>;
  if (!isSignedIn) return <AccessPage>{window.location.pathname === "/sign-up"
    ? <SignUp routing="hash" forceRedirectUrl="/" />
    : <SignIn routing="hash" forceRedirectUrl="/" />}<p className="pq-access-help">Accesso riservato agli utenti invitati. Hai bisogno di un account? Contatta l’amministratore.</p></AccessPage>;
  if (error) return <AccessPage><h2>Accesso da verificare</h2><p role="alert">{error}</p><div className="pq-access-actions">
    <button onClick={() => setRetry((value) => value + 1)}>Riprova</button><button onClick={() => void signOut()}>Esci</button></div></AccessPage>;
  if (!profile || profile.userId !== userId) return <AccessPage><p role="status">Verifica del tuo profilo…</p></AccessPage>;
  async function markWelcomeSeen() {
    const response = await fetch("/api/auth/welcome-seen", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error("Non è stato possibile salvare il benvenuto. Riprova.");
    const saved = await response.json() as { welcomeSeenAt: string };
    setProfile((current) => current ? { ...current, welcomeSeenAt: saved.welcomeSeenAt } : current);
  }
  return <IdentityContext.Provider value={{ profile, markWelcomeSeen }}><div key={profile.userId}>{children}</div></IdentityContext.Provider>;
}
