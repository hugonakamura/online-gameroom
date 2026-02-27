import { TicTacToeState } from '../../../types';
import { GameViewProps } from '../types';
import './TicTacToe.css';

export default function TicTacToe({ roomState, socketId, emit }: GameViewProps) {
  const state = roomState.gameState as TicTacToeState | undefined;
  const myIndex = roomState.players.findIndex((p) => p.id === socketId);
  const isMyTurn = state?.currentTurn === myIndex && roomState.gamePhase === 'choosing';

  const cellLabel = (value: 1 | 2 | null) => {
    if (value === 1) return 'X';
    if (value === 2) return 'O';
    return '';
  };

  const cellClass = (value: 1 | 2 | null, index: number) => {
    const classes = ['ttt-cell'];
    if (value === 1) classes.push('cell-x');
    if (value === 2) classes.push('cell-o');
    if (state?.winningLine?.includes(index)) classes.push('cell-winner');
    return classes.join(' ');
  };

  const statusMessage = () => {
    if (roomState.gamePhase === 'waiting') return 'Waiting for opponent to join…';
    if (roomState.gamePhase === 'result') {
      if (!state?.winner) return '';
      if (state.winner === 'draw') return "It's a draw!";
      const winnerIndex = state.winner - 1;
      return roomState.players[winnerIndex]?.nickname ?? 'Someone';
    }
    if (isMyTurn) return 'Your turn';
    const turnPlayer = roomState.players[state?.currentTurn ?? 0];
    return `${turnPlayer?.nickname ?? 'Opponent'}'s turn`;
  };

  const resultBanner = () => {
    if (!state?.winner) return null;
    if (state.winner === 'draw') {
      return <div className="result-banner draw">It's a draw!</div>;
    }
    const winnerIndex = state.winner - 1;
    const iWon = winnerIndex === myIndex;
    return (
      <div className={`result-banner ${iWon ? 'win' : 'lose'}`}>
        {iWon ? '🎉 You Win!' : `😔 ${roomState.players[winnerIndex]?.nickname ?? 'Opponent'} wins!`}
      </div>
    );
  };

  return (
    <>
      {/* Board */}
      <div className="ttt-section">
        <p className={`ttt-status${isMyTurn ? ' your-turn' : ''}`}>{statusMessage()}</p>

        {state && (
          <div className="ttt-board">
            {state.board.map((cell, i) => (
              <button
                key={i}
                className={cellClass(cell, i)}
                disabled={!isMyTurn || cell !== null || roomState.gamePhase !== 'choosing'}
                onClick={() => emit('game_input', { cellIndex: i })}
              >
                {cellLabel(cell)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="ttt-actions">
        {roomState.gamePhase === 'result' && (
          <>
            {resultBanner()}
            <button className="btn btn-primary" onClick={() => emit('play_again')}>
              Play Again
            </button>
          </>
        )}
      </div>
    </>
  );
}
