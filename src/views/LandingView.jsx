/* ============================================
   MNG Bot — Landing View
   
   Role selection screen: Host or Participant.
   This is the first page every user sees.
   ============================================ */
import { Icons } from '../components/Icons';

export default function LandingView({ onSelectRole }) {
  return (
    <div className="splash">
      <div className="splash__bg" />
      <div className="splash__content" style={{ padding: '0 24px', maxWidth: 400 }}>
        <div className="splash__logo" style={{ marginBottom: 12 }}>
          {Icons.bot}
        </div>
        <h1 className="splash__title" style={{ marginBottom: 4 }}>MNG Bot</h1>
        <p className="splash__subtitle" style={{ marginBottom: 32 }}>
          AI-Powered Meeting Assistant
        </p>

        <button
          className="btn btn--primary btn--lg btn--full"
          onClick={() => onSelectRole('host')}
          style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          👑 I am the Host
        </button>

        <button
          className="btn btn--secondary btn--lg btn--full"
          onClick={() => onSelectRole('participant')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          👤 I am a Participant
        </button>

        <p style={{
          marginTop: 24,
          fontSize: 11,
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          Hosts create meetings with a custom Meeting ID.<br />
          Participants join by entering the Meeting ID.
        </p>
      </div>
    </div>
  );
}
