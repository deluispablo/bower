import { Link } from 'react-router';
import { PoseBower } from '@/bird/Bower';

export function NotFound() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center', padding: 24 }}>
      <div>
        <PoseBower pose="wait" size={120} />
        <h1 style={{ fontSize: 28, marginTop: 8 }}>Nothing here</h1>
        <p className="muted" style={{ margin: '6px 0 18px' }}>
          It may have been moved or renamed.
        </p>
        <Link to="/">Go to Home</Link>
      </div>
    </div>
  );
}
