import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { isLoggedIn } from "./api";
import Login from "./pages/Login";
import Layout from "./pages/Layout";
import Dashboard from "./pages/Dashboard";
import Gantt from "./pages/Gantt";
import Orders from "./pages/Orders";
import Replan from "./pages/Replan";
import "./styles.css";

const qc = new QueryClient();

function Protected({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="gantt" element={<Gantt />} />
            <Route path="orders" element={<Orders />} />
            <Route path="replan" element={<Replan />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
