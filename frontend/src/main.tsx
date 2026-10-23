import "katex/dist/katex.min.css";
import "./index.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import { DetailProvider } from "./lib/detail";
import { ParamsProvider } from "./lib/params";
import { ThemeProvider } from "./lib/theme";

const Overview = lazy(() => import("./pages/Overview"));
const Playground = lazy(() => import("./pages/Playground"));
const Comparison = lazy(() => import("./pages/Comparison"));
const StrategicLab = lazy(() => import("./pages/StrategicLab"));
const LeaderFollower = lazy(() => import("./pages/LeaderFollower"));
const RepeatedLab = lazy(() => import("./pages/RepeatedLab"));
const IncompleteInfo = lazy(() => import("./pages/IncompleteInfo"));
const CitySimulation = lazy(() => import("./pages/CitySimulation"));
const Sensitivity = lazy(() => import("./pages/Sensitivity"));
const Methodology = lazy(() => import("./pages/Methodology"));
const Insights = lazy(() => import("./pages/Insights"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ParamsProvider>
        <DetailProvider>
        <BrowserRouter>
          <Layout>
            <Suspense fallback={<Loading label="Loading page…" tall />}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/playground" element={<Playground />} />
                <Route path="/comparison" element={<Comparison />} />
                <Route path="/strategic" element={<StrategicLab />} />
                <Route path="/leader-follower" element={<LeaderFollower />} />
                <Route path="/repeated" element={<RepeatedLab />} />
                <Route path="/bayesian" element={<IncompleteInfo />} />
                <Route path="/simulation" element={<CitySimulation />} />
                <Route path="/sensitivity" element={<Sensitivity />} />
                <Route path="/methodology" element={<Methodology />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="*" element={<Overview />} />
              </Routes>
            </Suspense>
          </Layout>
        </BrowserRouter>
        </DetailProvider>
      </ParamsProvider>
    </ThemeProvider>
  </StrictMode>,
);
