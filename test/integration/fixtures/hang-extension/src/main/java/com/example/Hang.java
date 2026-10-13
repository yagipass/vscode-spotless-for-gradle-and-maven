package com.example;

import java.io.File;
import java.io.IOException;
import javax.inject.Named;
import javax.inject.Singleton;
import org.apache.maven.AbstractMavenLifecycleParticipant;
import org.apache.maven.MavenExecutionException;
import org.apache.maven.execution.MavenSession;

@Named("hang")
@Singleton
public class Hang extends AbstractMavenLifecycleParticipant {

  @Override
  public void afterProjectsRead(MavenSession session) throws MavenExecutionException {
    if (session.getUserProperties().getProperty("spotlessIdeHook") == null) {
      return;
    }
    File hanging = new File(session.getTopLevelProject().getBuild().getDirectory(), "hanging");
    if (hanging.exists()) {
      return;
    }
    try {
      hanging.getParentFile().mkdirs();
      hanging.createNewFile();
      Thread.sleep(Long.MAX_VALUE);
    } catch (IOException | InterruptedException e) {
      throw new MavenExecutionException(e.toString(), e);
    }
  }
}
