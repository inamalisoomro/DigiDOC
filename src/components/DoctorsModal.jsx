import React, { useState } from 'react';
import { X, Search, Phone, MapPin, Stethoscope, Building, CheckCircle2 } from 'lucide-react';
import quettaDoctors from '../data/quetta_doctors.json';
import './Modals.css';

export default function DoctorsModal({ onClose, onSelectDoctor }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [bookedDoc, setBookedDoc] = useState(null);

  // Extract unique specialties from Quetta doctors
  const specialtiesSet = new Set(['ALL']);
  quettaDoctors.forEach(d => {
    if (d.primarySpecialty) specialtiesSet.add(d.primarySpecialty);
  });
  const specialtyList = Array.from(specialtiesSet);

  const filteredDoctors = quettaDoctors.filter(doc => {
    const matchesSearch = 
      doc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.primarySpecialty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.hospitalOrClinic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.area?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSpecialty = selectedSpecialty === 'ALL' || doc.primarySpecialty === selectedSpecialty;

    return matchesSearch && matchesSpecialty;
  }).slice(0, 50); // limit to top 50 for smooth scrolling

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Stethoscope className="modal-icon" size={24} />
            <div>
              <h3>Quetta Doctors & Clinics Directory</h3>
              <p className="modal-sub">Verified Specialists, Clinics & Contact Numbers across Quetta, Balochistan</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* Search bar & count */}
          <div className="doctor-search-row">
            <div className="search-box-input">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search Quetta doctor, specialty (Gynecology, Skin, Medicine), or clinic (Quetta Hospital)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="count-pill">{filteredDoctors.length} Doctors</span>
          </div>

          {/* Specialty Filter */}
          <div className="filter-scroll">
            {specialtyList.map(spec => (
              <button
                key={spec}
                className={`filter-chip ${selectedSpecialty === spec ? 'active' : ''}`}
                onClick={() => setSelectedSpecialty(spec)}
              >
                {spec}
              </button>
            ))}
          </div>

          {bookedDoc && (
            <div className="booking-success-banner">
              <CheckCircle2 size={20} />
              <div>
                <strong>Appointment Request Sent to {bookedDoc.name}!</strong>
                <p>Clinic: {bookedDoc.hospitalOrClinic}. You can also call directly at <strong>{bookedDoc.publicPhone}</strong>.</p>
              </div>
              <button className="small-dismiss" onClick={() => setBookedDoc(null)}>Dismiss</button>
            </div>
          )}

          {/* Doctors Grid */}
          <div className="doctors-list-grid">
            {filteredDoctors.map(doc => (
              <div key={doc.id} className="doctor-card">
                <div className="doctor-card-top">
                  <div>
                    <h4 className="doc-name">{doc.name}</h4>
                    <span className="doc-specialty">{doc.primarySpecialty}</span>
                  </div>
                  <span className="doc-id-badge">{doc.id}</span>
                </div>

                <div className="doc-clinic-info">
                  <p className="clinic-name"><Building size={14} /> {doc.hospitalOrClinic || 'Clinic/Hospital'}</p>
                  <p className="clinic-address"><MapPin size={13} /> {doc.address || doc.area || 'Quetta'}</p>
                </div>

                {doc.commonConditions && (
                  <p className="doc-scope-text">
                    <strong>Focus:</strong> {doc.commonConditions}
                  </p>
                )}

                <div className="doc-footer-actions">
                  {doc.publicPhone && (
                    <a href={`tel:${doc.publicPhone}`} className="call-doc-link">
                      <Phone size={14} /> {doc.publicPhone}
                    </a>
                  )}

                  <button 
                    className="consult-doc-btn"
                    onClick={() => {
                      if (onSelectDoctor) onSelectDoctor(doc);
                      setBookedDoc(doc);
                    }}
                  >
                    Select for DigiDoc
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
