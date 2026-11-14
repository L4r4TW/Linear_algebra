# Project Brief: Modern Linear Algebra Learning Platform

## 1. Project Vision

We are building a modern, interactive, web-based platform for learning and practicing linear algebra.

The primary goal is to create a significantly better user experience than traditional university mathematics platforms such as WeBWorK.

**Our core philosophy: Do not reinvent the mathematics engine. Build an exceptional learning experience on top of an existing, proven system.**

We will use the **WeBWorK Open Problem Library (OPL)** as our primary source of mathematics exercises and the **WeBWorK PG engine** for problem generation and mathematical answer validation.

Our competitive advantage will be:

- Beautiful, modern, minimalistic UI.
- Intuitive, distraction-free exercise solving.
- Interactive mathematical visualizations.
- Immediate feedback and helpful explanations.
- Personalized learning and progress tracking.
- Excellent responsiveness across desktop, tablet and mobile.
- Fast performance and intuitive navigation.

The initial focus is linear algebra, but the architecture should allow expansion into other mathematical subjects.

## 2. Technology Stack

### Frontend
- **Next.js:** Main application framework, using the App Router.
- **React:** Component-based user interface.
- **TypeScript:** Type-safe application development.
- **Tailwind CSS:** Styling and responsive layouts.
- **shadcn/ui:** Accessible, customizable UI components.
- **KaTeX:** Rendering mathematical expressions.
- **JSXGraph:** Interactive mathematical visualizations, especially vectors, coordinate systems and geometric transformations.

### Backend
- **Next.js Server Routes:** Backend-for-frontend API, authentication and communication with the mathematics engine.
- **Supabase PostgreSQL:** Database for users, exercises, sessions, attempts and learning progress.
- **Supabase Auth:** User authentication and authorization.
- **WeBWorK PG Engine:** Mathematical problem generation, randomization and answer evaluation.
- **OpenWeBWorK Standalone Renderer:** Dedicated service for executing PG exercises.
- **Docker:** Containerized execution of the WeBWorK renderer.

### External Open-Source Projects

WeBWorK Open Problem Library:
https://github.com/openwebwork/webwork-open-problem-library

WeBWorK PG Engine:
https://github.com/openwebwork/pg

WeBWorK Standalone Renderer:
https://github.com/openwebwork/renderer

WeBWorK 2:
https://github.com/openwebwork/webwork2

Use official documentation and repositories to verify integration details before implementation.

## 3. System Architecture

The application should follow a modular architecture with clear separation of responsibilities.

**Frontend (Next.js + React)**

Responsible for:
- Rendering exercises.
- Mathematical notation.
- Interactive diagrams.
- Student interactions.
- Answer input.
- Feedback display.
- Progress visualization.

**Application Backend (Next.js Server Routes)**

Responsible for:
- Authentication and authorization.
- Exercise selection.
- Communication with the WeBWorK renderer.
- Managing exercise sessions and random seeds.
- Processing grading results.
- Saving progress to Supabase.

**Mathematics Engine (WeBWorK PG)**

Responsible for:
- Loading exercises from OPL.
- Generating randomized exercise instances.
- Rendering mathematical problem content.
- Evaluating submitted answers.
- Returning grading feedback.

**Database (Supabase)**

Responsible for:
- User profiles.
- Exercise metadata.
- Exercise sessions.
- Student submissions.
- Scores and progress.

Do not implement a custom mathematics grading engine unless there is a compelling technical reason.

## 4. Exercise System

The platform must support different types of mathematics exercises.

Initial exercise types:
1. Numeric answers.
2. Vector answers.
3. Multiple-choice questions.
4. Multiple-select questions.
5. Mathematical expressions.

Future exercise types:
- Interactive vector drawing.
- Matrix manipulation.
- Coordinate selection.
- Drag-and-drop mathematical interactions.
- Interactive geometric transformations.

The frontend should use reusable components and a flexible exercise rendering system.

The architecture must accommodate exercises containing multiple answer fields and randomized parameters.

**Important:** WeBWorK PG files are executable Perl programs, not static JSON documents.

Do not assume every PG exercise can be represented using a simple question-and-answer schema.

Preserve the PG engine's mathematical evaluation capabilities.

## 5. UI/UX Design Principles

The interface should be inspired by the usability of modern learning platforms such as Khan Academy and Duolingo, without copying their visual identities.

Design principles:

- Minimalistic and visually polished.
- Mathematics is the main focus.
- One primary exercise at a time.
- Clear visual hierarchy.
- Generous spacing and readable typography.
- Consistent components and interactions.
- Mobile-first responsive design.
- Accessible controls and keyboard navigation.
- Subtle animations that improve usability.
- Clear feedback after answer submission.

### Exercise Interface

A typical exercise screen should contain:

1. Course and topic navigation.
2. Exercise progress indicator.
3. Exercise question.
4. Mathematical notation and optional interactive visualization.
5. Appropriate answer input.
6. Submit/check answer button.
7. Correct/incorrect feedback.
8. Optional hint.
9. Next exercise button.

The UI should not expose unnecessary technical details about WeBWorK.

## 6. Database Design

Start with a minimal Supabase schema.

Suggested tables:

**exercises**
- id
- title
- topic
- pg_file_path
- created_at

**exercise_sessions**
- id
- user_id
- exercise_id
- seed
- session_state
- created_at

**attempts**
- id
- session_id
- submitted_answer
- score
- created_at

Treat this as a preliminary design, not a fixed schema.

Use PostgreSQL migrations and appropriate constraints.

Implement Row Level Security (RLS) to protect student data.

Never trust client-submitted scores or grading results.

## 7. Initial Proof of Concept

The first milestone is to create a working application that integrates five real OPL linear algebra exercises.

Target exercise topics:

1. Vector addition.
2. Scalar multiplication.
3. Vector magnitude.
4. Unit vectors.
5. Dot product.

Find suitable exercises in OPL and verify their actual file paths and compatibility.

Do not invent OPL paths or exercise contents.

### Milestone 1 — Environment and PG Integration

- Inspect the existing repository before making changes.
- Set up the Next.js development environment if necessary.
- Configure the standalone WeBWorK renderer using Docker.
- Verify the renderer's actual API and response schema.
- Load one real OPL exercise.
- Generate a problem using a fixed random seed.
- Submit an answer.
- Receive a grading result from the PG engine.

**Success criterion:** One real OPL exercise can be generated and graded programmatically.

### Milestone 2 — Frontend Integration

- Create a clean exercise page.
- Render the exercise content.
- Display mathematical expressions correctly.
- Implement answer input.
- Submit answers through the Next.js backend.
- Display feedback returned by PG.
- Preserve the exercise instance across refreshes.

**Success criterion:** A student can complete one real PG exercise through our custom UI.

### Milestone 3 — Five Exercises

- Integrate five different linear algebra exercises.
- Support the necessary answer formats.
- Implement navigation between exercises.
- Handle loading, errors and submission states.

**Success criterion:** All five exercises work through the custom frontend.

### Milestone 4 — Supabase Integration

- Implement user authentication.
- Create database migrations.
- Store exercise sessions and attempts.
- Save grading results.
- Implement basic progress tracking.
- Configure RLS policies.

**Success criterion:** Authenticated users can solve exercises and retrieve their learning history.

## 8. Engineering Principles

Follow these rules throughout development:

1. **Reuse existing technology.** Avoid rebuilding functionality already provided by WeBWorK.
2. **Keep the architecture modular.** The frontend must not depend directly on PG internals.
3. **Use TypeScript strictly.** Avoid unnecessary `any` types.
4. **Keep components small and reusable.**
5. **Separate presentation, application logic and data access.**
6. **Prioritize maintainability over premature optimization.**
7. **Do not overengineer the proof of concept.**
8. **Verify third-party APIs before implementing integrations.**
9. **Implement basic error handling and logging.**
10. **Document important architectural decisions.**
11. **Keep the PG renderer behind server-side APIs.**
12. **Never expose privileged renderer operations, secrets or arbitrary PG execution to users.**
13. **Use a fixed, trusted allowlist of exercise files.**
14. **Treat PG execution as a security-sensitive service.**
15. **Check OPL and individual problem licenses before redistributing exercise content.**

## 9. Collaboration and Development Workflow

We will develop this application iteratively using Codex.

Act as an experienced senior full-stack engineer and software architect.

Before implementing significant changes:

- Inspect the existing codebase.
- Explain the proposed solution briefly.
- Identify dependencies and potential risks.
- Prefer the simplest maintainable implementation.

During implementation:

- Make small, logically grouped changes.
- Preserve existing working functionality.
- Avoid unrelated refactoring.
- Test critical functionality.
- Explain important technical decisions.
- Maintain clear project documentation.

After completing a milestone:

- Summarize what was implemented.
- Explain how to test it.
- Identify remaining issues.
- Recommend the next step.

Create and maintain an `AGENTS.md` file documenting project conventions, architecture and development instructions for future Codex sessions.

## 10. Immediate Task

**Start with Milestone 1: Verify the native WeBWorK PG integration.**

First, inspect the current repository and development environment.

Then propose the simplest reliable way to run the official standalone renderer locally and communicate with it from Next.js.

Before writing substantial application code, verify:

- The renderer builds and starts successfully.
- An actual OPL exercise loads.
- The exercise can be rendered as structured data or HTML suitable for our frontend.
- An answer can be submitted and evaluated.
- The problem seed and necessary session state can be preserved.

Do not assume API endpoints or request/response formats without verifying them against the installed renderer version.

Once the integration is proven, proceed to building the custom exercise interface.

**Our priority is to validate the architecture first, then build an outstanding user experience on top of it.**