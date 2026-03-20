// 应用根组件
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import Sidebar from './components/Sidebar';
import StartInterview from './pages/StartInterview';
import ResumeManager from './pages/ResumeManager';
import InterviewRoom from './pages/InterviewRoom';
import InterviewReport from './pages/InterviewReport';
import InterviewRecords from './pages/InterviewRecords';
import ModelSettings from './pages/ModelSettings';
import './styles/variables.css';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Sidebar />
        <Routes>
          <Route path="/" element={<StartInterview />} />
          <Route path="/resumes" element={<ResumeManager />} />
          <Route path="/interview/:id" element={<InterviewRoom />} />
          <Route path="/report/:sessionId" element={<InterviewReport />} />
          <Route path="/records" element={<InterviewRecords />} />
          <Route path="/settings" element={<ModelSettings />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
