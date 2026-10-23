import React from "react";
import "./ProNote.css";

/** Small gold PRO pill pinned to its parent's top corner, so a recite mic
 *  reads as a subscriber feature before anyone taps it. The parent must be
 *  `position: relative`. */
const ProBadge: React.FC = () => (
  <span className="pro-badge" aria-hidden="true">
    PRO
  </span>
);

export default ProBadge;
