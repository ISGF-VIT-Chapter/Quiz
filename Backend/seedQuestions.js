require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.question.deleteMany({});

    // Round 1 — MCQ (10 questions)
    const round1Questions = [
        { questionText: 'What is the capital of France?', optionA: 'London', optionB: 'Berlin', optionC: 'Paris', optionD: 'Madrid', correctAnswer: 'Paris', roundNumber: 1, orderIndex: 1, timeLimitSeconds: 30 },
        { questionText: 'What is the largest planet in our solar system?', optionA: 'Saturn', optionB: 'Jupiter', optionC: 'Neptune', optionD: 'Uranus', correctAnswer: 'Jupiter', roundNumber: 1, orderIndex: 2, timeLimitSeconds: 30 },
        { questionText: 'What is the chemical symbol for gold?', optionA: 'Go', optionB: 'Gd', optionC: 'Au', optionD: 'Ag', correctAnswer: 'Au', roundNumber: 1, orderIndex: 3, timeLimitSeconds: 30 },
        { questionText: 'Who wrote Romeo and Juliet?', optionA: 'Charles Dickens', optionB: 'Jane Austen', optionC: 'Mark Twain', optionD: 'William Shakespeare', correctAnswer: 'William Shakespeare', roundNumber: 1, orderIndex: 4, timeLimitSeconds: 30 },
        { questionText: 'In what year did World War II end?', optionA: '1943', optionB: '1944', optionC: '1945', optionD: '1946', correctAnswer: '1945', roundNumber: 1, orderIndex: 5, timeLimitSeconds: 30 },
        { questionText: 'What is the hardest natural substance on Earth?', optionA: 'Ruby', optionB: 'Diamond', optionC: 'Quartz', optionD: 'Topaz', correctAnswer: 'Diamond', roundNumber: 1, orderIndex: 6, timeLimitSeconds: 30 },
        { questionText: 'What is the largest ocean on Earth?', optionA: 'Atlantic Ocean', optionB: 'Indian Ocean', optionC: 'Arctic Ocean', optionD: 'Pacific Ocean', correctAnswer: 'Pacific Ocean', roundNumber: 1, orderIndex: 7, timeLimitSeconds: 30 },
        { questionText: 'Who painted the Mona Lisa?', optionA: 'Michelangelo', optionB: 'Raphael', optionC: 'Leonardo da Vinci', optionD: 'Donatello', correctAnswer: 'Leonardo da Vinci', roundNumber: 1, orderIndex: 8, timeLimitSeconds: 30 },
        { questionText: 'What is the main ingredient in guacamole?', optionA: 'Tomato', optionB: 'Avocado', optionC: 'Lime', optionD: 'Onion', correctAnswer: 'Avocado', roundNumber: 1, orderIndex: 9, timeLimitSeconds: 30 },
        { questionText: 'What is the boiling point of water in Celsius?', optionA: '90', optionB: '95', optionC: '100', optionD: '105', correctAnswer: '100', roundNumber: 1, orderIndex: 10, timeLimitSeconds: 30 },
    ];

    // Round 2 — Open-ended (for buzzer)
    const round2Questions = [
        { questionText: 'What is the capital of France?', correctAnswer: 'Paris', roundNumber: 2, orderIndex: 1 },
        { questionText: 'What is the largest planet in our solar system?', correctAnswer: 'Jupiter', roundNumber: 2, orderIndex: 2 },
        { questionText: 'What is the chemical symbol for gold?', correctAnswer: 'Au', roundNumber: 2, orderIndex: 3 },
        { questionText: 'Who wrote Romeo and Juliet?', correctAnswer: 'William Shakespeare', roundNumber: 2, orderIndex: 4 },
        { questionText: 'In what year did World War II end?', correctAnswer: '1945', roundNumber: 2, orderIndex: 5 },
    ];

    await prisma.question.createMany({ data: [...round1Questions, ...round2Questions] });
    console.log('Seeded 10 Round 1 MCQ questions and 5 Round 2 buzzer questions.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
