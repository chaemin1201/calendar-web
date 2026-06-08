import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainHome from './pages/MainHome';
import CalendarRoom from './pages/CalendarRoom';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainHome />} />
        <Route path="/calendar/:roomId" element={<CalendarRoom />} />
      </Routes>
    </Router>
  );
}
export default App;