import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Viewer from "./pages/Viewer";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin-dashboard" element={<Admin />} />
        <Route path="/viewer-dashboard" element={<Viewer />} />
      </Routes>
    </BrowserRouter>
  );
}
