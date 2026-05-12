#!/bin/bash
# Install pi-spec-workflow from local directory

set -e

WORKFLOW_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_SKILLS_DIR="$HOME/.pi/agent/skills"
PI_EXTENSIONS_DIR="$HOME/.pi/agent/extensions"

echo "📦 Installing pi-spec-workflow..."
echo "   Source: $WORKFLOW_DIR"
echo "   Target: $PI_SKILLS_DIR"

# Create skill directories
mkdir -p "$PI_SKILLS_DIR/spec-driven"
mkdir -p "$PI_SKILLS_DIR/bsd"

# Copy skills
cp -r "$WORKFLOW_DIR/skills/spec-driven/"* "$PI_SKILLS_DIR/spec-driven/"
cp -r "$WORKFLOW_DIR/skills/bsd/"* "$PI_SKILLS_DIR/bsd/"

# Create extension directory
mkdir -p "$PI_EXTENSIONS_DIR/bsd"

# Copy extension
cp -r "$WORKFLOW_DIR/extensions/bsd/"* "$PI_EXTENSIONS_DIR/bsd/"

echo "✅ Installation complete!"
echo ""
echo "Reload pi to activate:"
echo "  /reload"
echo ""
echo "Or restart pi."
