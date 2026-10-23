package io.github.yagipass.spotlessforgradleandmaven;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import javax.inject.Named;
import javax.inject.Singleton;
import org.apache.maven.execution.MojoExecutionEvent;
import org.apache.maven.execution.MojoExecutionListener;

@Named("spotlessForGradleAndMavenRatchetReset")
@Singleton
public class RatchetResetListener implements MojoExecutionListener {

  @Override
  public void beforeMojoExecution(MojoExecutionEvent event) {
    if (!"spotless-maven-plugin".equals(event.getExecution().getArtifactId())) {
      return;
    }
    Object stale;
    try {
      Class<?> ratchet =
          Class.forName(
              "com.diffplug.spotless.maven.GitRatchetMaven",
              true,
              event.getMojo().getClass().getClassLoader());
      Field instance = ratchet.getDeclaredField("instance");
      Constructor<?> constructor = ratchet.getDeclaredConstructor();
      instance.setAccessible(true);
      constructor.setAccessible(true);
      stale = instance.get(null);
      instance.set(null, constructor.newInstance());
    } catch (ReflectiveOperationException | RuntimeException e) {
      return;
    }
    if (stale instanceof AutoCloseable) {
      try {
        ((AutoCloseable) stale).close();
      } catch (Exception e) {
        return;
      }
    }
  }

  @Override
  public void afterMojoExecutionSuccess(MojoExecutionEvent event) {}

  @Override
  public void afterExecutionFailure(MojoExecutionEvent event) {}
}
