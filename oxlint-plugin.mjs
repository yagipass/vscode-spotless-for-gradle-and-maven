export default {
  meta: { name: "local" },
  rules: {
    "no-comments": {
      meta: {
        type: "suggestion",
        schema: [],
        messages: { comment: "Comments are not allowed in source code." },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              context.report({ loc: comment.loc, messageId: "comment" });
            }
          },
        };
      },
    },
  },
};
