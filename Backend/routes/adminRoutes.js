// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const quizController = require('../controllers/quizController');
const quizRound1Controller = require('../controllers/quizRound1Controller');
const roundController = require('../controllers/roundController');
const { protectAdmin } = require('../middleware/auth');

// Auth
router.post('/login', authController.loginAdmin);

// Teams (Protected)
router.get('/teams', protectAdmin, adminController.getAllTeams);
router.post('/teams', protectAdmin, adminController.addTeam);
router.delete('/teams/:id', protectAdmin, adminController.deleteTeam);
router.put('/teams/:id/status', protectAdmin, adminController.toggleTeamStatus);
router.put('/teams/:id/score', protectAdmin, adminController.updateTeamScore);
router.post('/teams/:id/logout', protectAdmin, adminController.forceLogoutTeam);

// Round Control
router.get('/rounds', protectAdmin, roundController.getRounds);
router.put('/rounds/:roundNumber/toggle', protectAdmin, roundController.toggleRound);

// Quiz & Buzzer Round 2 (Protected) — UNCHANGED
router.get('/questions', protectAdmin, quizController.getQuestions);
router.post('/buzzer/enable', protectAdmin, quizController.enableBuzzer);
router.post('/buzzer/disable', protectAdmin, quizController.disableBuzzer);
router.get('/buzzer/winner/:questionId', protectAdmin, quizController.getWinner);
router.get('/buzzer/logs/:questionId', protectAdmin, quizController.getQuestionBuzzes);
router.get('/round2/status', protectAdmin, quizController.getRound2QuestionStatus);

// Quiz Round 1 Admin
router.get('/quiz/results', protectAdmin, quizRound1Controller.getResults);

module.exports = router;
