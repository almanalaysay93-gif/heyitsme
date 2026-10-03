import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense } from "react";
import { Route, Switch, useLocation } from "wouter";
import { lazyRoute } from "./lib/lazyRoute";
import { LogoLoader } from "./components/BrandMark";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Each route ships as its own chunk so a public card never downloads the workspace.
const Landing = lazyRoute(() => import("./pages/Landing"));
const Home = lazyRoute(() => import("./pages/Home"));
const PublicCardPage = lazyRoute(() => import("./pages/PublicCard"));
const NotFound = lazyRoute(() => import("./pages/NotFound"));
const PrivacyPage = lazyRoute(() => import("./pages/Legal").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazyRoute(() => import("./pages/Legal").then((m) => ({ default: m.TermsPage })));
const AboutPage = lazyRoute(() => import("./pages/Info").then((m) => ({ default: m.AboutPage })));
const FaqPage = lazyRoute(() => import("./pages/Info").then((m) => ({ default: m.FaqPage })));
const PricingPage = lazyRoute(() => import("./pages/Pricing"));
const GoogleReviewsPage = lazyRoute(() => import("./pages/GoogleReviews"));
const AdminGoogleApiPage = lazyRoute(() => import("./pages/AdminGoogleApi"));
const AdminTeamsPage = lazyRoute(() => import("./pages/AdminTeams"));
// Team screens load only on /app/team, never with a public card.
const TeamHomePage = lazyRoute(() => import("./pages/Team").then((m) => ({ default: m.TeamHome })));
const TeamWorkspacePage = lazyRoute(() => import("./pages/Team").then((m) => ({ default: m.TeamWorkspace })));
const TeamJoinPage = lazyRoute(() => import("./pages/Team").then((m) => ({ default: m.TeamJoin })));
const PublicReviewPage = lazyRoute(() => import("./pages/PublicReview"));
const PublicEventPage = lazyRoute(() => import("./pages/PublicEvent"));

function RouteLoading() {
  return <div className="loading-screen" role="status" aria-label="Loading"><LogoLoader /></div>;
}

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/about" component={AboutPage} />
        <Route path="/faq" component={FaqPage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/app" component={Home} />
        <Route path="/app/cards" component={Home} />
        <Route path="/app/cards/new" component={Home} />
        <Route path="/app/cards/:id/edit" component={Home} />
        <Route path="/app/contacts" component={Home} />
        <Route path="/app/insights" component={Home} />
        <Route path="/app/billing" component={Home} />
        <Route path="/app/google-reviews" component={GoogleReviewsPage} />
        <Route path="/app/admin/google-api" component={AdminGoogleApiPage} />
        <Route path="/app/admin/teams" component={AdminTeamsPage} />
        <Route path="/app/team" component={TeamHomePage} />
        <Route path="/app/team/join/:token" component={TeamJoinPage} />
        <Route path="/app/team/:id" component={TeamWorkspacePage} />
        <Route path="/r/:slug" component={PublicReviewPage} />
        <Route path="/event/:slug" component={PublicEventPage} />
        <Route path="/c/:slug" component={PublicCardPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <a className="skip-link" href="#main">Skip to content</a>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
