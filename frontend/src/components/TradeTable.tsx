import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface Trade {
  id: string;
  counterparty: string;
  amount: string;
  status: string;
  date: string;
}

interface TradeTableProps {
  trades: Trade[];
}

const TradeTable: React.FC<TradeTableProps> = ({ trades }) => {
  const navigate = useNavigate();
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const focusRow = (index: number) => {
    if (index < 0 || index >= trades.length) return;
    setFocusedIndex(index);
    rowRefs.current[index]?.focus();
  };

  const openTrade = (trade: Trade) => {
    navigate(`/trades/${trade.id}`);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    index: number,
    trade: Trade,
  ) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        openTrade(trade);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusRow(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        focusRow(trades.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <table className="trade-table">
      <thead>
        <tr>
          <th scope="col">Counterparty</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Date</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade, index) => (
          <tr
            key={trade.id}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            tabIndex={0}
            role="button"
            aria-label={`Open trade with ${trade.counterparty} for ${trade.amount}`}
            className={`trade-row${focusedIndex === index ? ' trade-row--focused' : ''}`}
            onClick={() => openTrade(trade)}
            onKeyDown={(event) => handleKeyDown(event, index, trade)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(-1)}
          >
            <td>{trade.counterparty}</td>
            <td>{trade.amount}</td>
            <td>{trade.status}</td>
            <td>{trade.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TradeTable;
