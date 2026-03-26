// routes/teamRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const teamController = require('../controllers/teamController');
const quizRound1Controller = require('../controllers/quizRound1Controller');
const roundController = require('../controllers/roundController');
const { protectTeam } = require('../middleware/auth');

// Auth
router.post('/login', authController.loginTeam);
router.post('/logout', protectTeam, authController.logoutTeam);
router.post('/logout/beacon', authController.logoutTeamBeacon);

// Profile
router.get('/profile', protectTeam, teamController.getTeamProfile);

// Round status (public — no auth needed)
router.get('/rounds', roundController.getRounds);

// Buzzer Round 2 — UNCHANGED
router.post('/buzz', protectTeam, teamController.buzz);

// Quiz Round 1
router.post('/quiz/start', protectTeam, quizRound1Controller.startQuiz);
router.post('/quiz/answer', protectTeam, quizRound1Controller.submitAnswer);
router.get('/quiz/status', protectTeam, quizRound1Controller.getStatus);
router.post('/quiz/flag-violation', protectTeam, quizRound1Controller.flagViolation);

module.exports = router;
