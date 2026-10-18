import React from 'react';
import { AlertTriangle, PhoneCall, X } from 'lucide-react';
import './EmergencyBanner.css';

export default function EmergencyBanner({ onDismiss }) {
  return (
    <div className="emergency-alert-banner">
      <div className="emergency-content">
        <div className="emergency-icon-box">
          <AlertTriangle size={24} className="alert-icon" />
        </div>
        <div className="emergency-text">
          <h4 className="emergency-heading">URGENT MEDICAL SAFETY WARNING (ہنگامی الرٹ)</h4>
          <p className="emergency-desc">
            Yeh alamat kisi sangeen maslay ki nishandahi karti hain. Barahe karam foran Emergency Rescue 1122 par rabta karein ya qareebi hospital ke Emergency Room jayein. Online mashwaray ka intizar na karein!
          </p>
        </div>
        <div className="emergency-actions">
          <a href="tel:1122" className="call-1122-btn">
            <PhoneCall size={18} />
            <span>Call Rescue 1122</span>
          </a>
          {onDismiss && (
            <button className="dismiss-btn" onClick={onDismiss} title="Dismiss Warning">
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
