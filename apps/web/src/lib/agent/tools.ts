import { Type } from "@google/genai";

export const toolDeclarations = [
  {
    name: "read_file",
    description: "Read the contents of a file from the repository",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Relative path to the file from repository root",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file with the given content",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Relative path to the file from repository root",
        },
        content: {
          type: Type.STRING,
          description: "Complete file content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Edit a file by replacing a specific text block with new content",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Relative path to the file",
        },
        search: {
          type: Type.STRING,
          description: "Exact text to find and replace (must match exactly)",
        },
        replace: {
          type: Type.STRING,
          description: "New text to replace the search text with",
        },
      },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "list_directory",
    description: "List files and subdirectories in a directory",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: "Relative path to directory (empty string for root)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for a pattern across files in the repository",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pattern: {
          type: Type.STRING,
          description: "Text pattern to search for",
        },
        glob: {
          type: Type.STRING,
          description: "Optional glob pattern to filter files (e.g., '*.ts')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "run_command",
    description: "Execute a shell command in the repository directory",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: "Shell command to execute (e.g., 'npm test')",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "create_branch",
    description: "Create and checkout a new git branch",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Branch name (use format: fix/issue-description)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "commit_changes",
    description: "Stage all changes and create a commit",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: {
          type: Type.STRING,
          description: "Commit message (use conventional commits format)",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "create_pr",
    description: "Push branch and create a pull request on GitHub",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: "PR title",
        },
        body: {
          type: Type.STRING,
          description: "PR description explaining the fix",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "finish",
    description: "Signal that the task is complete",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          enum: ["fixed", "not_an_error", "cannot_fix"],
          description: "Reason for completion",
        },
        summary: {
          type: Type.STRING,
          description: "Brief summary of what was done or why it cannot be fixed",
        },
      },
      required: ["reason", "summary"],
    },
  },
];
