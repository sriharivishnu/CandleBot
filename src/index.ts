import { Probot } from "probot";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
    organization: process.env.OPENAI_ORGANIZATION,
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);


export = (app: Probot) => {
  // listen for pull request review comment creation
  app.on("pull_request_review_comment.created", async (context) => {
    if (context.isBot) return;
    console.log(context.payload);

    // get the file on which the comment is on
    let content = await context.octokit.repos.getContent({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      path: context.payload.comment.path,
      ref: context.payload.comment.commit_id
    });

    // get the sha of the file
    let sha = (content.data as {sha: string}).sha

    // fetch the blob from github database
    let resp = await context.octokit.rest.git.getBlob({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      file_sha: sha,
    });
    console.log(resp);

    // Decode file from base64
    let wholeFile = Buffer.from(resp.data.content, "base64").toString();

    // find the lines of code of the review comment
    let code = wholeFile.split("\n").slice((context.payload.comment.start_line || context.payload.comment.line!) - 1, context.payload.comment.line!).join("\n");
    if (!code) return;

    // get the result
    let result, message;
    if (context.payload.comment.body.startsWith("/add")) {
      result = await getCode(code);
      message = generateAddedMessage(code, result || "");
    } else {
      result = await getEdit(code, context.payload.comment.body);
      message = generateEditedMessage(result || "");
    }
    if (!result) return;

    // create a comment with teh result
    await context.octokit.pulls.createReplyForReviewComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      pull_number: context.payload.pull_request.number,
      comment_id: context.payload.comment.id,
      body: generateEditedMessage(result)
    });
  });
};

async function getEdit(codeContext: string, feedback: string): Promise<string | undefined> {
  console.log(feedback);
  console.log(codeContext);
  try {
    let response = await openai.createEdit({
      model: "code-davinci-edit-001",
      input: codeContext,
      instruction: feedback,
      temperature: 0,
    })
    return response.data.choices[0].text;
  } catch(e) {
    console.error(e);
    return undefined;
  }
}


async function getCode(codeContext: string): Promise<string | undefined> {
  try {
    let response = await openai.createCompletion({
      model: "code-davinci-002",
      prompt: codeContext,
      temperature: 0,
      max_tokens: 256,
    })
    return response.data.choices[0].text;
  } catch(e) {
    console.error(e);
    return undefined;
  }
}


function generateEditedMessage(result: string): string {
  return `
Suggested:
\`\`\`suggestion
${result}
\`\`\`
`
}

function generateAddedMessage(originalCode: string, result: string): string {
  return `
Suggested:
\`\`\`suggestion
${originalCode}${result}
\`\`\`
`
}