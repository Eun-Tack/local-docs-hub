# Product Brief

## Intent

Create a local-first, lightweight documentation viewer that is not tied to one project.
It should support Markdown as the source of truth, while making documents easier to read visually during collaboration, review, and PDF export.

## Why This Exists

- AI can generate Markdown quickly, but raw file browsing is hard to review
- teams need a more visual reading experience for tables, diagrams, and linked images
- documents sometimes need to be shared as polished browser views or PDFs
- the same tool should work across many projects, not only AIOP

## Primary Users

- BA
- PM
- developer
- solution architect
- reviewer

## Core Resources It Uses

- a local folder selected as the document root
- Markdown files
- linked image assets inside the same folder tree
- Mermaid code blocks for diagrams
- browser print for PDF output

## Main Pages

### 1. Document Browser

- folder tree
- file filter
- root folder setting

### 2. Document Viewer

- rendered Markdown
- images
- tables
- Mermaid diagrams
- linked Markdown navigation

### 3. Local Configuration

- current root folder
- app title
- reload action

## Initial Features

- connect to local folder
- render Markdown
- handle relative image links
- handle relative Markdown links
- render Mermaid
- print current document to PDF

## Expansion Ideas

- recent files
- favorites
- full-text search
- split view
- multiple roots
- export selected pages
- startup tray icon
- dark theme
- read-only review comments

## Design Direction

- local-first
- low setup cost
- browser-based UI
- no project lock-in
- easy to extend later into a richer desktop tool
