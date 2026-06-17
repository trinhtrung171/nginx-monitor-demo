import React from 'react'
import { motion } from 'framer-motion'
import { ArrowBigUp, ArrowBigDown } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { getScore, myVote } from '../lib/utils'

function VoteButtons({ votes, onVote, onAuthRequired, size = 22, vertical = true }) {
  const { user } = useAuth()
  const score = getScore(votes)
  const my = myVote(votes, user?.id)
  const Wrap = vertical ? 'div' : React.Fragment
  const wrapProps = vertical ? { className: 'vote-col' } : {}
  const handleClick = (e, type) => {
    e.stopPropagation()
    if (!user) { onAuthRequired?.(); return }
    onVote(type)
  }
  return (
    <Wrap {...wrapProps}>
      <motion.button whileTap={{ scale: 1.35 }} className={`v-btn up ${my === 'UP' ? 'voted-up' : ''}`} onClick={e => handleClick(e, 'UP')}>
        <ArrowBigUp size={size} fill={my === 'UP' ? 'currentColor' : 'none'} strokeWidth={my === 'UP' ? 2 : 1.5} />
      </motion.button>
      <motion.span key={score} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className={`v-count ${score > 0 ? 'hot' : score < 0 ? 'cold' : ''}`}>
        {Math.abs(score) >= 1000 ? `${(score / 1000).toFixed(1)}k` : score}
      </motion.span>
      <motion.button whileTap={{ scale: 1.35 }} className={`v-btn down ${my === 'DOWN' ? 'voted-down' : ''}`} onClick={e => handleClick(e, 'DOWN')}>
        <ArrowBigDown size={size} fill={my === 'DOWN' ? 'currentColor' : 'none'} strokeWidth={my === 'DOWN' ? 2 : 1.5} />
      </motion.button>
    </Wrap>
  )
}

export default VoteButtons
